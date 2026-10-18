/**
 * tree`…` — a lit-like tagged template that produces builtIns.tree element specifications.
 *
 * Authoring sugar only: the result is ordinary tree notation (`[header, pattern, children]`),
 * which stays the canonical, serializable form. Mapping, close to lit's:
 *
 * | In the template                      | Becomes                                               |
 * |--------------------------------------|-------------------------------------------------------|
 * | `name="literal"`, `name` (boolean)   | `'name :=': 'literal'` / `true` (baked under compile) |
 * | `name=${value}`                      | `'name :=': value`                                    |
 * | `.prop=${value}`                     | `prop: value` (a property)                            |
 * | `@click=${{ call: 'm' }}` / `${'m'}` | `' +=': { on: 'click', call: 'm' }` (event binding)   |
 * | `ish=${Manager}`                     | the `{ tag, ish }` header                             |
 * | `${each(of, { key, empty })}`        | the repeat `{ each, of, key, empty }` (one child)     |
 * | `${{ '_ ?=': […] }}` (attribute pos.) | merged into the pattern: any key markup can't express |
 * | `${null / undefined / false / ''}`   | nothing, as content (e.g. an optional child)          |
 * | text only / one `${value}` as content | `textContent: …`                                     |
 * | text mixed with `${…}`               | `'?. =&': { microJoin: [...] }`                       |
 * | `<p itemscope>…${p.date}…</p>`       | microJoin with `{ prop: 'date', val: '?.date' }`      |
 * | `${tree`…`}` as content              | a child element (composition)                         |
 * | `${choose(on, cases, fallback)}`     | a switch `{ switch, cases, default }` (one child)     |
 *
 * `${…}` values may be `?.` strings or `paths()` proxies (converted to their path).
 * Whitespace-only text between elements is dropped, and an element's content is trimmed
 * where the whitespace contains a line break (indentation). Elements may contain text or
 * elements, not both (except a leading text before the children, as in tree notation).
 *
 * Results are cached per call site: the same template with the same values returns the
 * same specification object, so builtIns.tree's spec identity (compile, literal skipping on
 * rebind) holds across calls.
 *
 * Parsed with a small parser of its own (not the browser's HTML parser, which would insert
 * `<tbody>`, auto-close `<p>`, etc.), so it also runs on a server. Errors are
 * TreeTemplateErrors, located precisely (see TreeTemplateLocation) for editors and tools.
 *
 * @example
 * const p = paths<Launch>();
 * const map = {
 *     launch: tree`
 *         <article class="card" aria-label=${p.label}>
 *             <h3 class="title">${p.name}</h3>
 *             <p>Launched ${p.date} by ${p.rocket}</p>
 *             <ul ${each(p.crew, { key: '?.id' })}><li>${'?.name'}</li></ul>
 *         </article>`,
 * };
 */
import { pathOf } from './paths.js';
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SELF_EVENT_KEYS = [' +=', '?. +='];
/** Markers for `${…}` positions in the joined source (private-use characters, not expected in templates). */
const HOLE_OPEN = '';
const HOLE_CLOSE = '';
const HOLE = /(\d+)/g;
const HOLE_AT_START = /^(\d+)/;
const holeMarker = (index) => `${HOLE_OPEN}${index}${HOLE_CLOSE}`;
/** A tree`…` error, with its location in the template (for editors and tools). */
export class TreeTemplateError extends Error {
    part;
    offset;
    line;
    column;
    constructor(message, location) {
        super(message);
        this.name = 'TreeTemplateError';
        const { part, offset, line, column } = location;
        this.part = part;
        this.offset = offset;
        this.line = line;
        this.column = column;
    }
}
/** Specifications this tag (or choose()) produced, so `${tree`…`}` in content is recognized as a child. */
const treeResults = new WeakSet();
const cache = new WeakMap();
/** Make an element a repeat: `<ul ${each('?.items', { key: '?.id' })}><li>…</li></ul>`. */
export function each(of = '?.', options = {}) {
    const { key, empty } = options;
    const directive = { kind: 'each', of: pathOf(of) ?? of };
    if (key !== undefined)
        directive.key = pathOf(key) ?? key;
    if (empty !== undefined)
        directive.empty = empty;
    return directive;
}
/** Recent choose() results per discriminant, so the same choice returns the same object (as tree`…` does). */
const chooseCache = new Map();
const CHOOSE_CACHE_SIZE = 8;
/**
 * Choose one of several specifications from the data, on every render (like lit's `choose`):
 * `${choose('?.phase', { hold: tree`…`, scrubbed: tree`…` }, tree`<p>Unknown</p>`)}` as content,
 * or as a whole map value. Produces the switch `{ switch, cases, default }`. The discriminant
 * is matched with `String(value)` against the case keys; nullish or unmatched → `fallback`.
 * A `null` case (or no case and no fallback) renders nothing.
 */
export function choose(on, cases, fallback) {
    const path = pathOf(on) ?? on;
    const keys = Object.keys(cases);
    const recent = typeof path === 'string' ? chooseCache.get(path) : undefined;
    const cached = recent?.find(spec => spec.default === fallback && sameCases(spec.cases, cases, keys));
    if (cached)
        return cached;
    const spec = { switch: path, cases: { ...cases } };
    if (fallback !== undefined)
        spec.default = fallback;
    treeResults.add(spec);
    if (typeof path === 'string') {
        const list = recent ?? [];
        list.unshift(spec);
        list.length = Math.min(list.length, CHOOSE_CACHE_SIZE);
        chooseCache.set(path, list);
    }
    return spec;
}
/** The same cases: the same keys, in order, with identical specifications. */
function sameCases(a, b, keysB) {
    const keysA = Object.keys(a);
    return keysA.length === keysB.length && keysA.every((key, i) => key === keysB[i] && a[key] === b[key]);
}
export function tree(strings, ...values) {
    const cached = cache.get(strings);
    if (cached && sameValues(cached.values, values))
        return cached.spec;
    const ctx = createContext(strings, values);
    const spec = toSpec(parseRoot(ctx), ctx);
    treeResults.add(spec);
    cache.set(strings, { values, spec });
    return spec;
}
/**
 * A `${…}` value that isn't known statically, for analyzeTree: an editor or build tool analyzing
 * source passes one for each expression it can't evaluate. Tree treats it leniently (it may be a
 * child, text, a directive or an event config), and shows it as `‹text›` in the produced notation.
 */
export class TreeUnknown {
    text;
    constructor(text = '…') {
        this.text = text;
    }
    toJSON() {
        return `‹${this.text}›`;
    }
}
/**
 * Analyzes a tree`…` template without running it, for editors and build tools: the same parser
 * and rules as the tag, but errors are returned rather than thrown, and nothing is cached.
 * Pass the template's static strings (with `raw`, so error offsets are source offsets) and a
 * stand-in for each `${…}`: the value if it's known (a `?.` string, `each(…)`, a plain object,
 * another analyzeTree result's `spec`, null…), or a `TreeUnknown`.
 */
export function analyzeTree(strings, values) {
    const ctx = createContext(strings, values);
    let root;
    try {
        root = parseRoot(ctx);
    }
    catch (e) {
        if (e instanceof TreeTemplateError)
            return { elements: [], errors: [e] };
        throw e;
    }
    const elements = [describe(root, ctx)];
    try {
        const spec = toSpec(root, ctx);
        treeResults.add(spec);
        return { spec, elements, errors: [] };
    }
    catch (e) {
        if (e instanceof TreeTemplateError)
            return { elements, errors: [e] };
        throw e;
    }
}
/** Join the static strings with hole markers, remembering where each string starts. */
function createContext(strings, values) {
    const starts = [];
    let source = '';
    strings.forEach((s, i) => {
        starts.push(source.length);
        source += s;
        if (i < values.length)
            source += holeMarker(i);
    });
    return { strings, values, starts, source };
}
/** The template's single root element. */
function parseRoot(ctx) {
    const roots = parse(ctx.source, ctx).filter(node => !isBlankText(node));
    if (roots.length !== 1 || isTextNode(roots[0])) {
        const at = roots.length > 1 ? roots[1].pos : roots[0]?.pos ?? 0;
        throw error(ctx, at, 'expected exactly one root element');
    }
    return roots[0];
}
/** The parsed element tree, with locations, for analyzeTree. */
function describe(element, ctx) {
    const { tag, pos, attrs, directives, children } = element;
    return {
        tag,
        location: locate(ctx, pos),
        attributes: attrs.map(({ name, parts, pos }) => {
            const hole = parts !== true && parts.length === 1 && isHole(parts[0]) ? parts[0].hole : undefined;
            return { name, location: locate(ctx, pos), ...(hole === undefined ? {} : { hole }) };
        }),
        directives: directives.map(({ hole, pos }) => ({ hole, location: locate(ctx, pos) })),
        children: children.filter((node) => !isTextNode(node)).map(child => describe(child, ctx)),
    };
}
// ── Locations and errors ─────────────────────────────────────────────────────
/**
 * The location of a source position: its static string and offset (in the raw string, i.e. the
 * source, when `strings.raw` is there), and line/column as displayed.
 */
function locate({ strings, starts }, pos) {
    let part = 0;
    while (part + 1 < starts.length && starts[part + 1] <= pos)
        part++;
    // A position inside a hole marker belongs to the end of the string before it
    const offset = Math.min(pos - starts[part], strings[part].length);
    const shown = displayText(strings, part, offset);
    const lineStart = shown.lastIndexOf('\n') + 1;
    const raw = strings.raw?.[part];
    return {
        part,
        offset: raw === undefined ? offset : rawOffset(raw, offset),
        line: shown.split('\n').length,
        column: shown.length - lineStart + 1,
    };
}
/** The offset in a raw template string (escapes as written) of an offset in its cooked string. */
function rawOffset(raw, cookedOffset) {
    let i = 0;
    let cooked = 0;
    while (cooked < cookedOffset && i < raw.length) {
        if (raw[i] !== '\\') {
            i++;
            cooked++;
            continue;
        }
        const escape = /^\\(?:u\{([\da-fA-F]+)\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|(\r\n|[\n\r])|[\s\S])/.exec(raw.slice(i));
        const [text, codePoint, lineContinuation] = escape;
        const length = lineContinuation ? 0 : codePoint ? String.fromCodePoint(parseInt(codePoint, 16)).length : 1;
        if (cooked + length > cookedOffset)
            break;
        i += text.length;
        cooked += length;
    }
    return i;
}
/** The template up to (part, offset), as displayed: each hole shown as `${…}`. */
function displayText(strings, part, offset) {
    return strings.slice(0, part).map(s => `${s}\${…}`).join('') + strings[part].slice(0, offset);
}
function error(ctx, pos, message) {
    const location = locate(ctx, pos);
    const { line, column } = location;
    const lines = ctx.strings.join('${…}').split('\n');
    const frame = `${lines[line - 1]}\n${' '.repeat(column - 1)}^`;
    return new TreeTemplateError(`tree\`…\`: ${message} (line ${line}, column ${column})\n${frame}`, location);
}
// ── Parsing ──────────────────────────────────────────────────────────────────
function parse(source, ctx) {
    const root = { tag: '#root', pos: 0, attrs: [], directives: [], children: [] };
    const stack = [root];
    let pos = 0;
    let textStart = -1;
    const flushText = () => {
        if (textStart >= 0)
            stack[stack.length - 1].children.push(splitText(source.slice(textStart, pos), textStart));
        textStart = -1;
    };
    while (pos < source.length) {
        const ch = source[pos];
        if (ch === '<' && source.startsWith('<!--', pos)) {
            flushText();
            const end = source.indexOf('-->', pos + 4);
            if (end < 0)
                throw error(ctx, pos, 'unclosed comment');
            pos = end + 3;
            continue;
        }
        if (ch === '<' && source[pos + 1] === '/') {
            flushText();
            const end = source.indexOf('>', pos);
            if (end < 0)
                throw error(ctx, pos, 'unclosed closing tag');
            const tag = source.slice(pos + 2, end).trim();
            const open = stack[stack.length - 1];
            if (open === root || open.tag !== tag) {
                throw error(ctx, pos, `</${tag}> doesn't match <${open === root ? '(none)' : open.tag}>`);
            }
            stack.pop();
            pos = end + 1;
            continue;
        }
        if (ch === '<' && /[A-Za-z]/.test(source[pos + 1] ?? '')) {
            flushText();
            pos = parseOpenTag(source, pos, stack, ctx);
            continue;
        }
        if (ch === '<' && source[pos + 1] === HOLE_OPEN)
            throw error(ctx, pos, 'a ${…} tag name is not supported');
        if (textStart < 0)
            textStart = pos;
        pos++;
    }
    flushText();
    if (stack.length > 1) {
        const open = stack[stack.length - 1];
        throw error(ctx, open.pos, `<${open.tag}> is not closed`);
    }
    return root.children;
}
/** Parse `<tag attrs…>` at `pos`; pushes the element (and onto the stack unless void/self-closing). */
function parseOpenTag(source, pos, stack, ctx) {
    const start = pos;
    const tagMatch = /^<([A-Za-z][\w:.-]*)/.exec(source.slice(pos));
    const tag = tagMatch[1];
    const element = { tag, pos: start, attrs: [], directives: [], children: [] };
    pos += tagMatch[0].length;
    for (;;) {
        while (/\s/.test(source[pos] ?? ''))
            pos++;
        if (pos >= source.length)
            throw error(ctx, start, `<${tag} is not closed`);
        if (source[pos] === '>') {
            pos++;
            break;
        }
        if (source.startsWith('/>', pos)) {
            pos += 2;
            stack[stack.length - 1].children.push(element);
            return pos;
        }
        const hole = HOLE_AT_START.exec(source.slice(pos));
        if (hole) {
            element.directives.push({ hole: Number(hole[1]), pos });
            pos += hole[0].length;
            continue;
        }
        const nameMatch = /^[^\s=>/]+/.exec(source.slice(pos));
        if (!nameMatch)
            throw error(ctx, pos, `unexpected "${source[pos]}" in <${tag}>`);
        const name = nameMatch[0];
        const attrPos = pos;
        pos += name.length;
        while (/\s/.test(source[pos] ?? ''))
            pos++;
        if (source[pos] !== '=') {
            element.attrs.push({ name, parts: true, pos: attrPos });
            continue;
        }
        pos++;
        while (/\s/.test(source[pos] ?? ''))
            pos++;
        let raw;
        const quote = source[pos];
        if (quote === '"' || quote === "'") {
            const end = source.indexOf(quote, pos + 1);
            if (end < 0)
                throw error(ctx, pos, `unclosed attribute value in <${tag}>`);
            raw = source.slice(pos + 1, end);
            pos = end + 1;
        }
        else {
            const match = /^[^\s>]+/.exec(source.slice(pos));
            raw = match[0];
            pos += raw.length;
        }
        element.attrs.push({ name, parts: splitText(raw, 0).parts, pos: attrPos });
    }
    stack[stack.length - 1].children.push(element);
    if (!VOID_TAGS.has(tag.toLowerCase()))
        stack.push(element);
    return pos;
}
/** Split text into literal strings (entities decoded) and holes, with each part's source position. */
function splitText(raw, pos) {
    const parts = [];
    const positions = [];
    let last = 0;
    const pushLiteral = (from, to) => {
        const literal = decodeEntities(raw.slice(from, to));
        if (literal) {
            parts.push(literal);
            positions.push(pos + from);
        }
    };
    for (const match of raw.matchAll(HOLE)) {
        const index = match.index;
        pushLiteral(last, index);
        parts.push({ hole: Number(match[1]) });
        positions.push(pos + index);
        last = index + match[0].length;
    }
    pushLiteral(last, raw.length);
    return { parts, positions, pos };
}
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
        if (body[0] === '#') {
            const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    });
}
// ── Conversion to tree notation ──────────────────────────────────────────────
const isHole = (part) => typeof part === 'object';
const isTextNode = (node) => 'parts' in node;
const isBlankText = (node) => isTextNode(node) && node.parts.every(part => typeof part === 'string' && !part.trim());
const isEachDirective = (value) => !!value && typeof value === 'object' && value.kind === 'each';
const isTreeResult = (value) => !!value && typeof value === 'object' && treeResults.has(value);
const isNothing = (value) => value == null || value === false || value === '';
const isUnknown = (value) => value instanceof TreeUnknown;
const isPlainObject = (value) => !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
/** A `${…}` value as it goes into a pattern: a paths() proxy becomes its `?.` string. */
const valueOf = (value) => pathOf(value) ?? value;
function toSpec(element, ctx) {
    const { tag } = element;
    const { values } = ctx;
    const fail = (message, pos = element.pos) => { throw error(ctx, pos, `<${tag}>: ${message}`); };
    const pattern = {};
    let ish;
    let events = 0;
    for (const { name, parts, pos } of element.attrs) {
        const value = parts === true ? true : attributeValue(parts, values, message => fail(message, pos), name);
        if (name === 'ish') {
            ish = value;
        }
        else if (name.startsWith('.')) {
            pattern[name.slice(1)] = value;
        }
        else if (name.startsWith('@')) {
            const on = name.slice(1);
            const config = typeof value === 'string' ? { call: value }
                : isUnknown(value) ? { '…': value }
                    : value && typeof value === 'object' ? value
                        : fail(`@${on} needs an event config object (e.g. { call: 'method' }) or a method name`, pos);
            const key = SELF_EVENT_KEYS[events++] ?? fail('at most two @event bindings per element are supported', pos);
            pattern[key] = { on, ...config };
        }
        else {
            pattern[`${name} :=`] = value;
        }
    }
    let repeat;
    for (const { hole, pos } of element.directives) {
        const directive = values[hole];
        if (isEachDirective(directive)) {
            if (repeat)
                fail('only one each(…) per element', pos);
            repeat = { of: directive.of };
            if (directive.key !== undefined)
                repeat.key = directive.key;
            if (directive.empty !== undefined)
                repeat.empty = directive.empty;
        }
        else if (isPlainObject(directive)) {
            // A pattern spread: any keys the markup can't express (e.g. '_ ?=' ternaries, ' =>' handlers)
            for (const key of Object.keys(directive))
                pattern[key] = valueOf(directive[key]);
        }
        else if (isUnknown(directive)) {
            // Statically unknown (analyzeTree): an each(…) or a pattern object, presumably
            pattern['…'] = directive;
        }
        else {
            fail('only each(…) or a pattern object can be placed in attribute position', pos);
        }
    }
    // itemscope (HTML's "this has microdata"): the values in the element's text get props
    const withProps = element.attrs.some(({ name }) => name === 'itemscope');
    const content = element.children.filter(node => !isBlankText(node));
    const header = ish === undefined ? tag : { tag, ish };
    let third;
    // Children: elements, and ${tree`…`} values in content; text before the first child is the element's own
    const children = [];
    const textParts = [];
    const textPositions = [];
    // A statically unknown ${…} (analyzeTree) is taken as a child where children are expected, else as text
    const unknownIsChild = !!repeat || content.some(node => !isTextNode(node)
        || node.parts.some(part => isHole(part) && isTreeResult(values[part.hole])));
    for (const node of content) {
        if (!isTextNode(node)) {
            children.push(toSpec(node, ctx));
            continue;
        }
        node.parts.forEach((part, i) => {
            const pos = node.positions[i];
            // Nothing to render (as in lit): null, undefined, false or ''
            if (isHole(part) && isNothing(values[part.hole]))
                return;
            if (isHole(part) && (isTreeResult(values[part.hole]) || (unknownIsChild && isUnknown(values[part.hole])))) {
                children.push(values[part.hole]);
            }
            else if (children.length > 0) {
                if (isHole(part) || part.trim())
                    fail('text after a child element isn\'t supported (wrap the text in an element)', pos + leadingSpace(part));
            }
            else {
                textParts.push(part);
                textPositions.push(pos);
            }
        });
    }
    const ownText = trimFormatting(textParts);
    if (repeat) {
        if (children.length !== 1 || ownText.length > 0)
            fail('an element with each(…) must contain exactly one child element (the item)');
        third = { each: children[0], ...repeat };
    }
    else {
        const firstHole = textParts.findIndex(isHole);
        applyText(ownText, children.length > 0, pattern, values, withProps, message => fail(message, textPositions[firstHole] ?? element.pos));
        if (children.length > 0)
            third = children;
    }
    return (third ? [header, pattern, third] : [header, pattern]);
}
/** How many whitespace characters a literal part starts with (so errors point at the text itself). */
function leadingSpace(part) {
    return typeof part === 'string' ? part.length - part.trimStart().length : 0;
}
/** An attribute's value: a literal string, or one `${…}` (as its value). Mixed text and `${}` isn't supported. */
function attributeValue(parts, values, fail, name) {
    if (parts.length === 0)
        return '';
    if (parts.length === 1)
        return isHole(parts[0]) ? valueOf(values[parts[0].hole]) : parts[0];
    return fail(`attribute "${name}" mixes text and \${…}; use a single \${…} (e.g. a pipe, or a computed value)`);
}
/** Drop leading/trailing whitespace that contains a line break (template indentation). */
function trimFormatting(parts) {
    const result = [...parts];
    if (typeof result[0] === 'string')
        result[0] = result[0].replace(/^\s*\n\s*/, '');
    const last = result.length - 1;
    if (last >= 0 && typeof result[last] === 'string')
        result[last] = result[last].replace(/\s*\n\s*$/, '');
    return result.filter(part => part !== '');
}
/**
 * An element's own text: literal text or one `${…}` → textContent; text mixed with `${…}` →
 * microJoin (so values become elements; groundwork for hydrating server-rendered markup).
 * With child elements, only a leading literal text is possible (as in tree notation).
 * With `withProps` (the element has `itemscope`), each path value becomes a `{ prop, val }`
 * segment, named after its last segment, so even a single value goes through microJoin.
 */
function applyText(parts, hasChildren, pattern, values, withProps, fail) {
    if (parts.length === 0)
        return;
    const holes = parts.filter(isHole);
    if (hasChildren && holes.length > 0)
        fail('${…} text next to child elements isn\'t supported (wrap it in an element)');
    if (holes.length === 0) {
        pattern.textContent = parts.join('');
        return;
    }
    const segment = (hole) => {
        const value = segmentOf(valueOf(values[hole.hole]));
        return withProps ? withProp(value) : value;
    };
    if (parts.length === 1) {
        const value = segment(holes[0]);
        // A microJoin segment ({ prop, val }, e.g. from md or itemscope) still needs microJoin
        if (value && typeof value === 'object' && 'prop' in value) {
            pattern['?. =&'] = { microJoin: [value] };
        }
        else {
            pattern.textContent = value;
        }
        return;
    }
    pattern['?. =&'] = { microJoin: parts.map(part => (isHole(part) ? segment(part) : part)) };
}
/** A microJoin item: paths stay strings; { prop, val } segments get their val's path. */
function segmentOf(value) {
    if (value && typeof value === 'object' && 'prop' in value && pathOf(value.val))
        return { ...value, val: pathOf(value.val) };
    return value;
}
/** A path (`?.a`, `$parent?.a`, `$root?.a`, `$0?.a`, optionally negated) and its last segment. */
const PROP_PATH = /^!{0,2}(?:\$0|\$root|\$parent)?\?\.(?:.*\?\.)?([^?]+)$/;
/**
 * Under itemscope: a path value → `{ prop, val }`, the prop named after the path's last segment
 * (`?.rocket?.name` → `name`, as md does). Anything else (literal text, an explicit `{ prop, … }`,
 * a path with no segment like `?.`) is left as is.
 */
function withProp(value) {
    if (typeof value !== 'string')
        return value;
    const match = PROP_PATH.exec(value);
    return match ? { prop: match[1], val: value } : value;
}
// ── Caching ──────────────────────────────────────────────────────────────────
function sameValues(a, b) {
    return a.length === b.length && a.every((value, i) => sameValue(value, b[i]));
}
/** Same value for caching: identical, the same path, or plain objects/arrays with the same entries (one level). */
function sameValue(a, b) {
    if (a === b)
        return true;
    const pathA = pathOf(a);
    if (pathA !== undefined)
        return pathA === pathOf(b);
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
        return false;
    if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
        return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every(key => {
        const x = a[key];
        const y = b[key];
        return x === y || (pathOf(x) !== undefined && pathOf(x) === pathOf(y));
    });
}

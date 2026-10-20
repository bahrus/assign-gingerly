// Generates the two pages of the hydration benchmark from the same deterministic data:
//
//   json.html       sections with no attributes, then the data again as <script type="application/json">,
//                   parsed at the end (the "ship the data twice" approach)
//   microdata.html  the same sections with itemprop attributes (and <data value> / <time datetime>),
//                   and a script at the end that builds the object back from the markup
//
// Both show the same text to the user, and both time from a script at the top of <head> to the
// end of their final script. Run: node demos/hydration-benchmark/generate.mjs [sections=1000]

import fs from 'node:fs';
import path from 'node:path';

const count = Number(process.argv[2] ?? 1000);
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// ── Deterministic data ──────────────────────────────────────────────────────

let seed = 7;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = list => list[Math.floor(random() * list.length)];
const firstNames = ['Avery', 'Rowan', 'Mika', 'Jordan', 'Sasha', 'Kai', 'Noor', 'Emil', 'Ines', 'Tomas'];
const lastNames = ['Quinn', 'Okafor', 'Laine', 'Silva', 'Novak', 'Haddad', 'Tanaka', 'Moreau', 'Kowalski', 'Reyes'];
const roles = ['Commander', 'Pilot', 'Mission Specialist', 'Flight Engineer', 'Payload Specialist'];
const rockets = ['Falcon 9', 'Falcon Heavy', 'Atlas V', 'Electron', 'Vulcan', 'Ariane 6'];
const sites = ['Pad 39A', 'SLC-40', 'SLC-41', 'LC-1', 'ELA-4'];

const launches = Array.from({ length: count }, (_, i) => ({
    id: `launch-${String(i + 1).padStart(5, '0')}`,
    name: `Demo Mission ${i + 1}`,
    flight: i + 1,
    date: new Date(Date.UTC(2020, 0, 1) + Math.floor(random() * 6 * 365 * 24 * 60) * 60000).toISOString(),
    rocket: pick(rockets),
    site: pick(sites),
    mass: Math.floor(random() * 600000) + 1000,
    success: random() > 0.15,
    details: `Sample payload ${i + 1}: a fictional flight used to compare shipping data as JSON with reading it back from markup.`,
    crew: Array.from({ length: 3 }, () => ({ name: `${pick(firstNames)} ${pick(lastNames)}`, role: pick(roles) })),
}));

// ── Shared formatting (so both pages show exactly the same text) ────────────

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' });
const numberFormat = new Intl.NumberFormat('en-US');
const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = text => escape(text).replace(/"/g, '&quot;');

const style = `<style>
    body { font-family: system-ui, sans-serif; margin: 1rem auto; max-width: 900px; padding: 0 1rem; color: #1d2330; }
    section { border: 1px solid #d9dee7; border-radius: 10px; padding: 0.5rem 1rem; margin: 0.75rem 0; background: #f7f9fc; }
    h3 { margin: 0.25rem 0; font-size: 1rem; }
    p { margin: 0.25rem 0; }
    ul { margin: 0.25rem 0; }
    #timing { position: sticky; top: 0; background: #fff8e1; border: 1px solid #e0c060; border-radius: 8px; padding: 0.5rem 1rem; font-family: ui-monospace, monospace; z-index: 1; }
</style>`;

/** The top of both pages: the start of the clock, before any content. */
const head = title => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script>window.t0 = performance.now();</script>
${style}
</head>
<body>
<div id="timing">Measuring…</div>
<h1>${title}</h1>
`;

/**
 * Shows the timing. During a compare.html run (?run), also records it (and the object, once per
 * page) in sessionStorage, and navigates on: real top-level page loads, not frames, which
 * Chromium parses very differently.
 */
const report = `
    const timing = { html: t1 - window.t0, script: t2 - t1, total: t2 - window.t0, launches: result.length };
    window.timing = timing;
    window.result = result;
    document.getElementById('timing').textContent =
        \`\${timing.launches} launches · HTML parsed in \${timing.html.toFixed(1)} ms · script \${timing.script.toFixed(1)} ms · total \${timing.total.toFixed(1)} ms\`;
    const run = new URLSearchParams(location.search).has('run') && JSON.parse(sessionStorage.getItem('hydration-benchmark') || 'null');
    if (run) {
        const page = location.pathname.split('/').pop();
        (run.samples[page] ??= []).push(timing);
        if (!(page in run.results)) run.results[page] = JSON.stringify(result);
        const next = run.queue.shift() ?? 'compare.html?results';
        sessionStorage.setItem('hydration-benchmark', JSON.stringify(run));
        // After this task, so the page has finished loading
        setTimeout(() => location.replace(next), 0);
    }`;

// ── Page 1: plain markup, then the data as JSON ─────────────────────────────

function plainSection(l) {
    return `<section>
<h3>${escape(l.name)}</h3>
<p>Flight ${l.flight} · ${escape(dateFormat.format(new Date(l.date)))} UTC</p>
<p>${escape(l.rocket)} from ${escape(l.site)} · payload ${numberFormat.format(l.mass)} kg · ${l.success ? 'Success' : 'Failure'}</p>
<p>${escape(l.details)}</p>
<ul>${l.crew.map(c => `<li><span>${escape(c.name)}</span> — <span>${escape(c.role)}</span></li>`).join('')}</ul>
</section>
`;
}

const jsonPage = head('Hydration benchmark: HTML + JSON')
    + launches.map(plainSection).join('')
    + `<script type="application/json" id="data">${JSON.stringify(launches).replace(/</g, '\\u003c')}</script>
<script>
    const t1 = performance.now();
    const result = JSON.parse(document.getElementById('data').textContent);
    const t2 = performance.now();
${report}
</script>
</body>
</html>
`;

// ── Page 2: the same markup with microdata, read back into the object ───────

function microdataSection(l) {
    return `<section itemscope>
<meta itemprop="id" content="${escapeAttr(l.id)}">
<h3 itemprop="name">${escape(l.name)}</h3>
<p>Flight <data itemprop="flight" value="${l.flight}">${l.flight}</data> · <time itemprop="date" datetime="${l.date}">${escape(dateFormat.format(new Date(l.date)))}</time> UTC</p>
<p><span itemprop="rocket">${escape(l.rocket)}</span> from <span itemprop="site">${escape(l.site)}</span> · payload <data itemprop="mass" value="${l.mass}">${numberFormat.format(l.mass)}</data> kg · <data itemprop="success" value="${l.success}">${l.success ? 'Success' : 'Failure'}</data></p>
<p itemprop="details">${escape(l.details)}</p>
<ul>${l.crew.map(c => `<li itemprop="crew" itemscope><span itemprop="name">${escape(c.name)}</span> — <span itemprop="role">${escape(c.role)}</span></li>`).join('')}</ul>
</section>
`;
}

// Reads an item back: itemprops in its own scope (not inside nested items); a nested itemscope is an
// object; <data value> and <meta content> give typed values ("7" → 7, "true" → true); <time datetime>
// the ISO date; otherwise textContent. A name that occurs more than once becomes an array; "crew" is
// always an array (the data model says so: microdata can't tell a one-item list from a single value).
const extractor = `
    const ARRAYS = new Set(['crew']);
    const typed = text => text === 'true' ? true : text === 'false' ? false : text !== '' && !isNaN(text) ? Number(text) : text;
    function valueOf(el) {
        if (el.hasAttribute('itemscope')) return readItem(el);
        switch (el.localName) {
            case 'data': return typed(el.value);
            case 'meta': return el.content;
            case 'time': return el.dateTime;
            default: return el.textContent;
        }
    }
    function readItem(scope) {
        const item = {};
        // Walk the scope's subtree, not entering nested items
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT, {
            acceptNode: el => el.parentElement !== scope && el.parentElement.closest('[itemscope]') !== scope
                ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
        });
        for (let el = walker.nextNode(); el; el = walker.nextNode()) {
            const name = el.getAttribute('itemprop');
            if (!name) continue;
            const value = valueOf(el);
            if (ARRAYS.has(name)) (item[name] ??= []).push(value);
            else if (name in item) item[name] = [].concat(item[name], value);
            else item[name] = value;
        }
        return item;
    }`;

const microdataPage = head('Hydration benchmark: HTML with microdata')
    + launches.map(microdataSection).join('')
    + `<script>${extractor}
    const t1 = performance.now();
    const result = [...document.querySelectorAll('body > section[itemscope]')].map(readItem);
    const t2 = performance.now();
${report}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, 'json.html'), jsonPage);
fs.writeFileSync(path.join(dir, 'microdata.html'), microdataPage);
console.log(`${count} launches: json.html ${(jsonPage.length / 1024).toFixed(0)} KB, microdata.html ${(microdataPage.length / 1024).toFixed(0)} KB`);

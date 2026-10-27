/**
 * Data pipes: pipes described as data instead of written as functions, so they survive structuredClone
 * (IndexedDB, postMessage), e.g. on their way to a worker that renders with o2h.
 *
 * Opt-in: the core doesn't know about them. dataPipes() turns descriptors into ordinary pipe functions,
 * so they work everywhere pipes do, synchronously (getValue, builtIns.tree, sync ops, ternaries):
 *
 *     const pipes = dataPipes({
 *         longUtc: { intl: 'DateTimeFormat', locale: 'en-US', options: { dateStyle: 'long', timeZone: 'UTC' } },
 *         phase:   { map: { hold: 'On hold', go: 'Go' }, default: 'Unknown' },
 *         price:   { use: 'toFixed', args: [2] },
 *         when:    { chain: ['parseDate', 'longUtc'] },
 *         clock:   s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,   // functions pass through
 *     });
 *
 * Each function made from a descriptor carries it (under PIPE_DESCRIPTOR, a global symbol), so code that
 * stores pipes (o2h's prepareO2HTransform) can keep the descriptor instead of losing the pipe.
 *
 * Deliberately small: Intl formatting, lookups, a fixed set of built-ins, and chains. No comparisons,
 * arithmetic, filtering or sorting: pipes that need those stay functions.
 */

import type { Pipes, PipeDescriptor, IntlPipeDescriptor, MapPipeDescriptor, UsePipeDescriptor, ChainPipeDescriptor } from '../types/assign-gingerly/types.js';

/** Where a pipe made from a descriptor keeps it: a registered symbol, so other packages find it without importing this module. */
export const PIPE_DESCRIPTOR: unique symbol = Symbol.for('assign-gingerly.pipeDescriptor') as any;

/** The descriptor a pipe was made from, if it was made by dataPipes(). */
export function pipeDescriptorOf(pipe: unknown): PipeDescriptor | undefined {
    return typeof pipe === 'function' ? (pipe as any)[PIPE_DESCRIPTOR] : undefined;
}

/** The built-ins `use` names, and `chain` can name directly. Each takes the value, then the descriptor's args. */
const BUILT_INS: Record<string, (value: any, ...args: any[]) => any> = {
    parseDate: v => Date.parse(v),
    number: v => Number(v),
    string: v => String(v),
    trim: v => String(v).trim(),
    upper: v => String(v).toUpperCase(),
    lower: v => String(v).toLowerCase(),
    length: v => v?.length,
    toFixed: (v, digits) => Number(v).toFixed(digits),
    slice: (v, start, end) => v?.slice?.(start, end),
    join: (v, separator) => (Array.isArray(v) ? v.join(separator) : v),
    default: (v, fallback) => v ?? fallback,
};

const INTL_KINDS = new Set(['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'PluralRules', 'ListFormat']);

/** How deep chains may nest (a chain naming itself, directly or not, would otherwise recurse forever). */
const MAX_CHAIN_DEPTH = 32;

/**
 * Pipes, from descriptors and functions: functions are kept as they are, descriptors become functions.
 * Unknown descriptors, built-ins and chain names throw here, not on first use.
 */
export function dataPipes(entries: Record<string, ((value: any) => any) | PipeDescriptor>): Pipes {
    const pipes: Pipes = {};
    for (const [name, entry] of Object.entries(entries)) {
        pipes[name] = typeof entry === 'function' ? entry : withDescriptor(fromDescriptor(name, entry, pipes), entry);
    }
    // Chain names: a pipe of this object, or a built-in
    for (const [name, entry] of Object.entries(entries)) {
        if (typeof entry === 'function' || !('chain' in entry)) continue;
        for (const link of entry.chain) {
            if (!Object.hasOwn(pipes, link) && !Object.hasOwn(BUILT_INS, link)) {
                throw new Error(`dataPipes: "${name}" chains "${link}", which is neither a pipe here nor a built-in`);
            }
        }
    }
    return pipes;
}

function withDescriptor(pipe: (value: any) => any, descriptor: PipeDescriptor): (value: any) => any {
    Object.defineProperty(pipe, PIPE_DESCRIPTOR, { value: descriptor });
    return pipe;
}

function fromDescriptor(name: string, d: PipeDescriptor, pipes: Pipes): (value: any) => any {
    if (d && typeof d === 'object') {
        if ('intl' in d) return intlPipe(name, d);
        if ('map' in d) return mapPipe(d);
        if ('use' in d) return usePipe(name, d);
        if ('chain' in d) return chainPipe(d, pipes);
    }
    throw new Error(`dataPipes: "${name}" is neither a function nor a pipe descriptor ({ intl }, { map }, { use } or { chain })`);
}

function intlPipe(name: string, d: IntlPipeDescriptor): (value: any) => any {
    if (!INTL_KINDS.has(d.intl)) throw new Error(`dataPipes: "${name}": unknown Intl kind "${d.intl}"`);
    const formatter = new (Intl as any)[d.intl](d.locale, d.options);
    switch (d.intl) {
        case 'DateTimeFormat':
            // ISO strings (as JSON carries dates) are accepted, as well as dates and timestamps
            return v => formatter.format(typeof v === 'string' ? new Date(v) : v);
        case 'RelativeTimeFormat':
            return v => formatter.format(v, d.unit ?? 'day');
        case 'PluralRules':
            return v => d.cases?.[formatter.select(v)] ?? d.cases?.other;
        default:
            return v => formatter.format(v);
    }
}

function mapPipe(d: MapPipeDescriptor): (value: any) => any {
    return v => {
        const key = String(v);
        return Object.hasOwn(d.map, key) ? d.map[key] : d.default;
    };
}

function usePipe(name: string, d: UsePipeDescriptor): (value: any) => any {
    const builtIn = BUILT_INS[d.use];
    if (!Object.hasOwn(BUILT_INS, d.use)) throw new Error(`dataPipes: "${name}": unknown built-in "${d.use}" (${Object.keys(BUILT_INS).join(', ')})`);
    const args = d.args ?? [];
    return v => builtIn(v, ...args);
}

let chainDepth = 0;

function chainPipe(d: ChainPipeDescriptor, pipes: Pipes): (value: any) => any {
    return v => {
        chainDepth++;
        try {
            if (chainDepth > MAX_CHAIN_DEPTH) throw new Error(`dataPipes: a chain nests more than ${MAX_CHAIN_DEPTH} deep (does it name itself?)`);
            // Like a path, a chain stops at null / undefined
            let result = v;
            for (const link of d.chain) {
                if (result == null) return result;
                result = Object.hasOwn(pipes, link) ? pipes[link](result) : BUILT_INS[link](result);
            }
            return result;
        } finally {
            chainDepth--;
        }
    };
}

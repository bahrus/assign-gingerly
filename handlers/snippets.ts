/**
 * Snippets for builtIns.tree: static HTML from the `snippets` option, named by a
 * `{ snippet: 'name' }` specification. Each distinct string is parsed once into a `<template>`
 * (by the browser's parser, so SVG and MathML get their namespaces), checked, and then cloned
 * per instance.
 *
 * Snippets are author content: they come from the options (code), never from a config or the
 * data. Still, a snippet must pass the checks Tree's own attribute writes do, so a permission
 * profile can't be bypassed with raw HTML. A refused snippet throws, naming what was refused.
 *
 * Top level: one or more elements, with only whitespace between them (no text, no comments), so
 * a snippet occupies exactly its root elements' slots, on the client and in server markup alike.
 */

import { snippetSource } from './treeSpec.js';
import type { AssignFromOptions, PermissionProcessor } from '../types/assign-gingerly/types.js';
import type { SnippetSpecification } from '../types/assign-gingerly/treeTypes.js';

/** A snippet string, parsed and checked. */
export interface ParsedSnippet {
    /** The (trimmed) HTML it was parsed from: a later run with another string for the name rebuilds */
    html: string;
    template: HTMLTemplateElement;
    /** The root elements' local names, in order (what `adopt` checks server markup against) */
    tags: string[];
    /**
     * The holes (`data-hole="name"` elements, attribute removed), by name: each one's path, the
     * index of its root element and then element-child indices. Found once per string.
     */
    holes: Map<string, number[]>;
}

/** The attribute marking a snippet's holes: elements whose attributes and content a tree can fill. */
export const HOLE_ATTRIBUTE = 'data-hole';

/** A hole's element in an instance's root elements, by its path (undefined when markup lacks it, e.g. server markup that doesn't match). */
export function holeAt(roots: Element[], path: number[]): Element | undefined {
    let el: Element | undefined = roots[path[0]];
    for (let i = 1; i < path.length && el; i++) el = el.children[path[i]];
    return el;
}

/** Attributes holding URLs, where `javascript:` is refused. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data']);

/** Parsed snippets per permission processor (snippets without one share NO_PROCESSOR), by HTML string. */
const parsedSnippets = new WeakMap<object, Map<string, ParsedSnippet>>();
const NO_PROCESSOR = {};

/** The parsed (and checked) snippet for a spec, from the options' `snippets`, parsed on first use. */
export function parsedSnippet(
    spec: SnippetSpecification, options: AssignFromOptions, permissionProcessor: PermissionProcessor | undefined, doc: Document
): ParsedSnippet {
    const html = snippetSource(spec, options.snippets);
    const key = permissionProcessor ?? NO_PROCESSOR;
    let byHtml = parsedSnippets.get(key);
    if (!byHtml) parsedSnippets.set(key, byHtml = new Map());
    let parsed = byHtml.get(html);
    if (!parsed) {
        parsed = parseSnippet(spec.snippet, html, permissionProcessor, doc);
        byHtml.set(html, parsed);
    }
    return parsed;
}

/** A fresh copy of a snippet's nodes, imported into `doc` (so custom elements in it upgrade). */
export function cloneSnippet({ template }: ParsedSnippet, doc: Document): ChildNode[] {
    return [...doc.importNode(template.content, true).childNodes];
}

function parseSnippet(name: string, html: string, permissionProcessor: PermissionProcessor | undefined, doc: Document): ParsedSnippet {
    const template = doc.createElement('template');
    template.innerHTML = html;
    const tags: string[] = [];
    for (const node of template.content.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            tags.push((node as Element).localName);
        } else if (node.nodeType !== Node.TEXT_NODE || (node as Text).data.trim() !== '') {
            throw new Error(`builtIns.tree: snippet "${name}" has ${node.nodeType === Node.TEXT_NODE ? 'text' : 'a comment'} at its top level; only elements (and whitespace between them) can be there: wrap it in an element`);
        }
    }
    if (tags.length === 0) throw new Error(`builtIns.tree: snippet "${name}" has no element`);
    checkContent(name, template.content, permissionProcessor);
    return { html, template, tags, holes: findHoles(name, template.content) };
}

/**
 * Record each hole's path and remove its attribute (so the DOM matches what o2h writes).
 * Not supported (yet), so refused rather than silently ignored: a hole inside another hole
 * (its fallback content), and duplicate names. (Holes inside a nested <template> are refused by checkContent.)
 */
function findHoles(name: string, content: DocumentFragment): Map<string, number[]> {
    const holes = new Map<string, number[]>();
    for (const el of content.querySelectorAll(`[${HOLE_ATTRIBUTE}]`)) {
        const hole = el.getAttribute(HOLE_ATTRIBUTE)!;
        if (holes.has(hole)) throw new Error(`builtIns.tree: snippet "${name}" has two holes named "${hole}"`);
        if (el.parentElement?.closest(`[${HOLE_ATTRIBUTE}]`)) {
            throw new Error(`builtIns.tree: snippet "${name}" has a hole ("${hole}") inside another hole, which isn't supported`);
        }
        const path: number[] = [];
        for (let at: Element = el; ; at = at.parentElement!) {
            const parent = at.parentElement;
            path.unshift([...(parent ?? content).children].indexOf(at));
            if (!parent) break;
        }
        holes.set(hole, path);
    }
    for (const el of content.querySelectorAll(`[${HOLE_ATTRIBUTE}]`)) el.removeAttribute(HOLE_ATTRIBUTE);
    return holes;
}

/** Refuse what Tree wouldn't write itself: scripts, event handler attributes, javascript: URLs, and what the permission processor blocks. */
function checkContent(name: string, root: ParentNode, permissionProcessor: PermissionProcessor | undefined): void {
    for (const el of root.querySelectorAll('*')) {
        const { localName } = el;
        if (localName === 'script') throw new Error(`builtIns.tree: snippet "${name}" contains a <script>, which snippets can't`);
        for (const { name: attr, value } of el.attributes) {
            const lower = attr.toLowerCase();
            if (lower.startsWith('on')) throw new Error(`builtIns.tree: snippet "${name}" has an event handler attribute (${attr} on <${localName}>), which snippets can't; bind events in the tree`);
            if (URL_ATTRIBUTES.has(lower) && /^\s*javascript:/i.test(value)) {
                throw new Error(`builtIns.tree: snippet "${name}" has a javascript: URL (${attr} on <${localName}>)`);
            }
            if (permissionProcessor?.checkRestrictedAttributeCall('setAttribute', [attr, value]).blocked) {
                throw new Error(`builtIns.tree: snippet "${name}" has an attribute the permission profile blocks (${attr} on <${localName}>)`);
            }
        }
        // A nested <template>'s content isn't in the main tree: check it too
        if (localName === 'template') {
            const { content } = el as HTMLTemplateElement;
            if (content.querySelector(`[${HOLE_ATTRIBUTE}]`)) {
                throw new Error(`builtIns.tree: snippet "${name}" has a hole inside a nested <template>, which isn't supported (yet)`);
            }
            checkContent(name, content, permissionProcessor);
        }
    }
}

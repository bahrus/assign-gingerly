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
/** Attributes holding URLs, where `javascript:` is refused. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data']);
/** Parsed snippets per permission processor (snippets without one share NO_PROCESSOR), by HTML string. */
const parsedSnippets = new WeakMap();
const NO_PROCESSOR = {};
/** The parsed (and checked) snippet for a spec, from the options' `snippets`, parsed on first use. */
export function parsedSnippet(spec, options, permissionProcessor, doc) {
    const html = snippetSource(spec, options.snippets);
    const key = permissionProcessor ?? NO_PROCESSOR;
    let byHtml = parsedSnippets.get(key);
    if (!byHtml)
        parsedSnippets.set(key, byHtml = new Map());
    let parsed = byHtml.get(html);
    if (!parsed) {
        parsed = parseSnippet(spec.snippet, html, permissionProcessor, doc);
        byHtml.set(html, parsed);
    }
    return parsed;
}
/** A fresh copy of a snippet's nodes, imported into `doc` (so custom elements in it upgrade). */
export function cloneSnippet({ template }, doc) {
    return [...doc.importNode(template.content, true).childNodes];
}
function parseSnippet(name, html, permissionProcessor, doc) {
    const template = doc.createElement('template');
    template.innerHTML = html;
    const tags = [];
    for (const node of template.content.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            tags.push(node.localName);
        }
        else if (node.nodeType !== Node.TEXT_NODE || node.data.trim() !== '') {
            throw new Error(`builtIns.tree: snippet "${name}" has ${node.nodeType === Node.TEXT_NODE ? 'text' : 'a comment'} at its top level; only elements (and whitespace between them) can be there: wrap it in an element`);
        }
    }
    if (tags.length === 0)
        throw new Error(`builtIns.tree: snippet "${name}" has no element`);
    checkContent(name, template.content, permissionProcessor);
    return { html, template, tags };
}
/** Refuse what Tree wouldn't write itself: scripts, event handler attributes, javascript: URLs, and what the permission processor blocks. */
function checkContent(name, root, permissionProcessor) {
    for (const el of root.querySelectorAll('*')) {
        const { localName } = el;
        if (localName === 'script')
            throw new Error(`builtIns.tree: snippet "${name}" contains a <script>, which snippets can't`);
        for (const { name: attr, value } of el.attributes) {
            const lower = attr.toLowerCase();
            if (lower.startsWith('on'))
                throw new Error(`builtIns.tree: snippet "${name}" has an event handler attribute (${attr} on <${localName}>), which snippets can't; bind events in the tree`);
            if (URL_ATTRIBUTES.has(lower) && /^\s*javascript:/i.test(value)) {
                throw new Error(`builtIns.tree: snippet "${name}" has a javascript: URL (${attr} on <${localName}>)`);
            }
            if (permissionProcessor?.checkRestrictedAttributeCall('setAttribute', [attr, value]).blocked) {
                throw new Error(`builtIns.tree: snippet "${name}" has an attribute the permission profile blocks (${attr} on <${localName}>)`);
            }
        }
        // A nested <template>'s content isn't in the main tree: check it too
        if (localName === 'template')
            checkContent(name, el.content, permissionProcessor);
    }
}

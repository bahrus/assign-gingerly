/**
 * builtIns.scope handler for assignFrom.
 *
 * Binds an existing element's scope (e.g. server-rendered markup) against a sub-value of
 * `from`: where builtIns.tree creates a scope from a spec, scope takes over one that's
 * already there.
 *
 * - **The value:** `get: { value }` if given, else `from[itemprop]` (the element's itemprop
 *   attribute). Neither → an error (use `get: { value: '?.' }` for the whole `from`).
 * - **The manager (optional):** `ish` (a registered name or a class) if given, else the name
 *   in the element's `itemscope` attribute. With one, the value goes to `el.ish`, and the
 *   manager instance is the scope's view model; without one, the value itself is. Names
 *   resolve through the `registry` option first, and an unregistered one is waited for.
 * - **The binding:** `bind` is an assignFrom call on the element: `bind.pattern`, with the
 *   other `bind` keys as its options (`infer`, `withMethods`, …), and `from` set to the view
 *   model. `$parent` is the outer `from`. Event bindings get default dedup keys, so reruns
 *   replace listeners rather than stacking them.
 * - **Rebinding:** every call assigns the value and binds again. A manager's `ctx.rebind()`,
 *   and the settling of an async `onAssigned`, bind again against the manager.
 *
 * **Pending marks:** after its first bind, the element's `data-residue` mark (see applyResidue)
 * is removed. Apply a server residue before taking a scope over, so its entry isn't skipped.
 *
 * `infer` keeps its covenant: it never enters a nested itemscope by itself. builtIns.scope is
 * how you step into one, explicitly.
 *
 * @example
 * // <section itemprop="rocket" itemscope="rocket-manager">…<span itemprop="heightLabel"></span>…</section>
 * '#[rocketCard] =>': {
 *     do: 'builtIns.scope',
 *     bind: {
 *         infer: { byItemprop: true },
 *         pattern: { '?.querySelector?.button.inc +=': { on: 'click', call: 'increaseHeightByOne' } },
 *         withMethods: ['querySelector'],
 *     },
 * }
 */

import { assignFrom } from '../assignFrom.js';
import { assignGingerly } from '../assignGingerly.js';
import { defineIshCore, setScopeBinder } from '../handleIshProperty.js';
import { resolveRegistry } from '../utils/resolveRegistry.js';
import { waitForEvent } from '../utils/waitForEvent.js';
import { withEventKeys } from './eventKeys.js';
import { RESIDUE_ATTRIBUTE } from '../applyResidue.js';
import type {
    AssignFromHandler, AssignFromOptions, ItemscopeManager, ItemscopeManagerConfig, ItemscopeRegistry,
    PermissionProcessor, ScopeBinding, ScopeConfig,
} from '../types/assign-gingerly/types.js';

/** Outer options a scope's binding inherits (the rest come from `bind`). */
const INHERITED_OPTIONS = ['pipes', 'protocols', 'registry', 'handlers', 'signal', 'aka'] as const;

/** Configs for managers given as classes: used directly, never registered. */
const classConfigs = new WeakMap<object, ItemscopeManagerConfig>();

/** Elements whose scope is being bound right now (so a rebind() triggered meanwhile is a no-op). */
const binding = new WeakSet<Element>();

export class ScopeHandler implements AssignFromHandler {
    config: ScopeConfig;

    constructor(config: ScopeConfig) {
        this.config = config;
    }

    assign(lhsTarget: any, resolvedParams: Record<string, any>, options: AssignFromOptions, permissionProcessor?: PermissionProcessor): Promise<void> | void {
        if (!(lhsTarget instanceof Element)) throw new Error('builtIns.scope: the target must be an element');
        const element = lhsTarget;
        const { ish, bind } = this.config;
        const value = scopeValue(element, resolvedParams, options);
        const managerRef = ish ?? managerName(element);
        if (managerRef === undefined) {
            bindScope(element, value, bind, options, permissionProcessor);
            // Bound: no longer pending (see applyResidue)
            element.removeAttribute(RESIDUE_ATTRIBUTE);
            return;
        }
        const config = managerConfig(managerRef, element, options);
        if (config instanceof Promise) {
            return config.then(resolved => withManager(element, resolved, value, bind, options, permissionProcessor));
        }
        withManager(element, config, value, bind, options, permissionProcessor);
    }
}

/** The value the scope binds to: `get.value`, else `from[itemprop]`. */
function scopeValue(element: Element, resolvedParams: Record<string, any>, options: AssignFromOptions): any {
    if ('value' in resolvedParams) return resolvedParams.value;
    const itemprop = element.getAttribute('itemprop');
    if (itemprop) return options.from?.[itemprop];
    throw new Error(
        `builtIns.scope: no value for <${element.localName}>: give it an itemprop (its value is read from "from"), `
        + `or pass get: { value: '?.path' } (get: { value: '?.' } for the whole "from")`
    );
}

/** The manager name in the element's itemscope attribute, if any (a bare itemscope has none). */
function managerName(element: Element): string | undefined {
    const itemscope = element.getAttribute('itemscope');
    return itemscope ? itemscope : undefined;
}

/** A manager's config: a class directly; a name through the registries, waiting for it if needed. */
function managerConfig(ref: string | ItemscopeManager, element: Element, options: AssignFromOptions): ItemscopeManagerConfig | Promise<ItemscopeManagerConfig> {
    if (typeof ref !== 'string') {
        let config = classConfigs.get(ref);
        if (!config) classConfigs.set(ref, config = { manager: ref });
        return config;
    }
    const registry = resolveRegistry('itemscopeRegistry', options, element) as ItemscopeRegistry | undefined;
    if (!registry) throw new Error('builtIns.scope: no itemscope registry is available');
    const config = registry.get(ref);
    if (config) return config;
    return waitForEvent(registry, ref).then(() => {
        const registered = registry.get(ref);
        if (!registered) throw new Error(`builtIns.scope: itemscope manager "${ref}" not found after its registration event`);
        return registered;
    });
}

/** Attach the manager (once), assign the value to it, and bind the scope against it; register the rebinder. */
function withManager(
    element: Element, config: ItemscopeManagerConfig, value: any, bind: ScopeBinding | undefined,
    options: AssignFromOptions, permissionProcessor?: PermissionProcessor
): void {
    const rebind = () => bindScope(element, (element as any).ish, bind, options, permissionProcessor);
    // Before attaching: a constructor calling ctx.rebind() already reaches this binding
    setScopeBinder(element, rebind);
    // Possibly attached already: by an earlier call, or by an outer infer routing the value to `ish`
    if (!('ish' in element)) defineIshCore(element as HTMLElement, config, options, assignGingerly);
    (element as any).ish = value;
    rebind();
    // Bound against its manager: no longer pending (see applyResidue)
    element.removeAttribute(RESIDUE_ATTRIBUTE);
}

/** Bind the element's scope: `bind.pattern` and options, with `from` set to the view model. */
function bindScope(
    element: Element, viewModel: any, bind: ScopeBinding = {}, options: AssignFromOptions, permissionProcessor?: PermissionProcessor
): void {
    // Nothing to bind to yet (a nullish value, or a manager still being constructed), or already binding
    if (viewModel == null || binding.has(element)) return;
    const { pattern = {}, ...bindOptions } = bind;
    const nestedOptions: Record<string, any> = {};
    for (const key of INHERITED_OPTIONS) if (options[key] !== undefined) nestedOptions[key] = options[key];
    Object.assign(nestedOptions, bindOptions, {
        from: viewModel,
        fromStack: [...(options.fromStack ?? []), options.from],
    });
    binding.add(element);
    try {
        assignFrom(element, withEventKeys(pattern, 'builtIns.scope'), nestedOptions as AssignFromOptions, permissionProcessor);
    } finally {
        binding.delete(element);
    }
}

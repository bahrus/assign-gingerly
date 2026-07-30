/**
 * installForwarding - Installs getter/setter property forwarding on a class prototype.
 * 
 * Reads `static propLinks` from the constructor and installs getter/setter pairs
 * that delegate to nested paths on the instance.
 * 
 * - Getter uses `resolveValue` for full path resolution (with caching, method support, aliases).
 * - Setter uses `assignGingerly` for path-based assignment (creates intermediates as needed).
 * 
 * @example
 * import { installForwarding } from 'assign-gingerly/installForwarding.js';
 * 
 * class ClubMember extends HTMLElement {
 *     static propLinks = {
 *         'command': '?.behaviors?.commandBehavior?.command',
 *         'commandForElement': '?.behaviors?.commandBehavior?.commandForElement'
 *     };
 * }
 * 
 * installForwarding(ClubMember);
 * // Now el.command delegates to el.behaviors.commandBehavior.command
 */

import { resolveValue} from '../resolveValues.js';
import {ResolveValuesOptions, IAssignGingerlyOptions} from '../types/assign-gingerly/types.js';
import assignGingerly, {  } from '../assignGingerly.js';

export interface InstallForwardingOptions extends ResolveValuesOptions, IAssignGingerlyOptions {}

/**
 * Installs property forwarding on a class prototype based on `static propLinks`.
 * 
 * Each entry in `propLinks` maps a top-level property name to a `?.`-delimited
 * path string. A getter/setter pair is installed on the prototype that:
 * - Getter: resolves the path against `this` using `resolveValue`
 * - Setter: assigns the value at the path using `assignGingerly`
 * 
 * @param ctr - The constructor whose prototype will receive forwarded properties
 * @param options - Optional assignGingerly/resolveValues options (withMethods, aka, etc.)
 * @throws If a forwarded property name already exists on the prototype
 */
export function installForwarding(ctr: Function, options?: InstallForwardingOptions): void {
    const propLinks: Record<string, string> | undefined = (ctr as any).propLinks;
    if (!propLinks) return;

    for (const [propName, path] of Object.entries(propLinks)) {
        // Validate: don't overwrite existing properties
        if (Object.getOwnPropertyDescriptor(ctr.prototype, propName)) {
            throw new Error(
                `installForwarding: "${propName}" already exists on ${(ctr as any).name || 'constructor'}.prototype`
            );
        }

        // Validate: path must start with ?.
        if (!path.startsWith('?.')) {
            throw new Error(
                `installForwarding: path for "${propName}" must start with "?." — got "${path}"`
            );
        }

        Object.defineProperty(ctr.prototype, propName, {
            get(this: any) {
                return resolveValue(path, this, options);
            },
            set(this: any, value: any) {
                assignGingerly(this, { [path]: value }, options);
            },
            enumerable: true,
            configurable: true
        });
    }
}

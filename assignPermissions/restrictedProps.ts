import type { AssignPermissions, RestrictedPropSetting } from '../types/assign-gingerly/types.js';

export type RestrictedPropSettingsMap = Map<string, RestrictedPropSetting | undefined>;

const warnedOnce = new Set<string>();

function warnRestricted(key: string): void {
    if (!warnedOnce.has(key)) {
        warnedOnce.add(key);
        console.warn(`assignGingerly: property '${key}' is in restrictedPropSettings â€” assignment skipped.`);
    }
}

export function buildRestrictedPropSet(permissions: AssignPermissions | undefined): RestrictedPropSettingsMap | undefined {
    const settings = permissions?.restrictedPropSettings;
    if (!settings || settings.length === 0) return undefined;
    const restrictedPropSet: RestrictedPropSettingsMap = new Map();
    for (const setting of settings) {
        const prop = typeof setting === 'string' ? setting : setting.prop;
        if (restrictedPropSet.has(prop)) {
            throw new Error(`assignGingerly: duplicate restrictedPropSettings entry for '${prop}'.`);
        }
        restrictedPropSet.set(prop, typeof setting === 'string' ? undefined : setting);
    }
    return restrictedPropSet;
}

export function checkRestrictedProp(restrictedPropSet: RestrictedPropSettingsMap | undefined, key: string): boolean {
    if (!restrictedPropSet || !restrictedPropSet.has(key)) return false;
    warnRestricted(key);
    return true;
}

export function redirectRestrictedProp(
    restrictedPropSet: RestrictedPropSettingsMap | undefined,
    target: any,
    key: string,
    value: any
): boolean {
    if (!restrictedPropSet || !restrictedPropSet.has(key)) return false;
    const setting = restrictedPropSet.get(key);
    if (!setting?.useMethod) {
        warnRestricted(key);
        return true;
    }
    const method = target?.[setting.useMethod];
    if (typeof method !== 'function') {
        warnRestricted(key);
        return true;
    }
    method.call(target, value);
    return true;
}

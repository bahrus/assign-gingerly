const warnedOnce = new Set();
function warnRestricted(key) {
    if (!warnedOnce.has(key)) {
        warnedOnce.add(key);
        console.warn(`assignGingerly: property '${key}' is in restrictedPropSettings â€” assignment skipped.`);
    }
}
export function buildRestrictedPropSet(permissions) {
    const settings = permissions?.restrictedPropSettings;
    if (!settings || settings.length === 0)
        return undefined;
    const restrictedPropSet = new Map();
    for (const setting of settings) {
        const prop = typeof setting === 'string' ? setting : setting.prop;
        if (restrictedPropSet.has(prop)) {
            throw new Error(`assignGingerly: duplicate restrictedPropSettings entry for '${prop}'.`);
        }
        restrictedPropSet.set(prop, typeof setting === 'string' ? undefined : setting);
    }
    return restrictedPropSet;
}
export function checkRestrictedProp(restrictedPropSet, key) {
    if (!restrictedPropSet || !restrictedPropSet.has(key))
        return false;
    warnRestricted(key);
    return true;
}
export function redirectRestrictedProp(restrictedPropSet, target, key, value) {
    if (!restrictedPropSet || !restrictedPropSet.has(key))
        return false;
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

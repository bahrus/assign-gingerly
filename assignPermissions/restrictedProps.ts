import type { AssignPermissions, RestrictedPropSetting, RestrictedPropSettingsMap } from '../types/assign-gingerly/types.js';
import { isAllowedUrl } from './isAllowedUrl.js';



const warnedOnce = new Set<string>();

function warnRestricted(key: string): void {
    if (!warnedOnce.has(key)) {
        warnedOnce.add(key);
        console.warn(`assignGingerly: property '${key}' is in restrictedPropSettings — assignment skipped.`);
    }
}

function normalizeStrings(value: string | string[] | undefined): string[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

function normalizeAttrNames(attr: boolean | string | string[] | undefined, propNames: string[]): string[] {
    if (attr === undefined || attr === false) return [];
    if (attr === true) return propNames;
    return normalizeStrings(attr);
}

function applyAllowedSetting(setting: RestrictedPropSetting | undefined, target: any, key: string, value: any): boolean {
    if (setting?.useMethod) {
        const method = target?.[setting.useMethod];
        if (typeof method === 'function') {
            method.call(target, value);
            return true;
        }
        warnRestricted(key);
        return true;
    }
    return false;
}

export function buildRestrictedPropSet(permissions: AssignPermissions | undefined): RestrictedPropSettingsMap | undefined {
    const settings = permissions?.restrictedPropSettings;
    if (!settings || settings.length === 0) return undefined;
    const props = new Map<string, RestrictedPropSetting | undefined>();
    const attrs = new Map<string, RestrictedPropSetting | undefined>();
    for (const setting of settings) {
        if (typeof setting === 'string') {
            if (props.has(setting)) {
                throw new Error(`assignGingerly: duplicate restrictedPropSettings entry for '${setting}'.`);
            }
            props.set(setting, undefined);
            continue;
        }

        const propNames = normalizeStrings(setting.props);
        if (propNames.length === 0) {
            throw new Error('assignGingerly: restrictedPropSettings object entry must have a props value.');
        }
        for (const prop of propNames) {
            if (props.has(prop)) {
                throw new Error(`assignGingerly: duplicate restrictedPropSettings entry for '${prop}'.`);
            }
            props.set(prop, setting);
        }

        const attrNames = normalizeAttrNames(setting.attr, propNames);
        for (const attr of attrNames) {
            if (attrs.has(attr)) {
                throw new Error(`assignGingerly: duplicate restrictedPropSettings attr entry for '${attr}'.`);
            }
            attrs.set(attr, setting);
        }
    }
    return { props, attrs };
}

export function checkRestrictedProp(restrictedPropSet: RestrictedPropSettingsMap | undefined, key: string): boolean {
    if (!restrictedPropSet || !restrictedPropSet.props.has(key)) return false;
    warnRestricted(key);
    return true;
}

export function redirectRestrictedProp(
    restrictedPropSet: RestrictedPropSettingsMap | undefined,
    target: any,
    key: string,
    value: any
): boolean {
    if (!restrictedPropSet || !restrictedPropSet.props.has(key)) return false;
    const setting = restrictedPropSet.props.get(key);

    const { allowCrossDomain, allowFromSameDomain } = setting || {};

    if (allowCrossDomain) {
        return applyAllowedSetting(setting, target, key, value);
    }

    if (allowFromSameDomain) {
        if (isAllowedUrl(value)) {
            return applyAllowedSetting(setting, target, key, value);
        }
        warnRestricted(key);
        return true;
    }

    if (setting?.useMethod) {
        const method = target?.[setting.useMethod];
        if (typeof method === 'function') {
            method.call(target, value);
            return true;
        }
    }

    warnRestricted(key);
    return true;
}

export function checkRestrictedAttributeCall(
    restrictedPropSet: RestrictedPropSettingsMap | undefined,
    methodName: string,
    args: any[]
): { blocked: boolean; attrName?: string } {
    if (!restrictedPropSet || methodName !== 'setAttribute' || args.length === 0) {
        return { blocked: false };
    }
    const attrName = String(args[0]);
    if (!restrictedPropSet.attrs.has(attrName)) {
        return { blocked: false };
    }
    const setting = restrictedPropSet.attrs.get(attrName);
    const value = args[1];
    const { allowCrossDomain, allowFromSameDomain } = setting || {};

    if (allowCrossDomain) {
        return { blocked: false, attrName };
    }

    if (allowFromSameDomain) {
        if (isAllowedUrl(value)) {
            return { blocked: false, attrName };
        }
        warnRestricted(attrName);
        return { blocked: true, attrName };
    }

    warnRestricted(attrName);
    return { blocked: true, attrName };
}

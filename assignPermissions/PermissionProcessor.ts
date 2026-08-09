import type { AssignPermissions, RestrictedPropSetting } from '../types/assign-gingerly/types.js';
import { isAllowedUrl } from './isAllowedUrl.js';

export interface RestrictedPropSettingsMap {
    props: Map<string, RestrictedPropSetting | undefined>;
    attrs: Map<string, RestrictedPropSetting | undefined>;
}

export class PermissionProcessor {
    private readonly permissions: AssignPermissions | undefined;
    private readonly props: Map<string, RestrictedPropSetting | undefined>;
    private readonly attrs: Map<string, RestrictedPropSetting | undefined>;
    private readonly warned = new Set<string>();

    constructor(permissions: AssignPermissions | undefined) {
        this.permissions = permissions;
        const { props, attrs } = buildMaps(permissions);
        this.props = props;
        this.attrs = attrs;
    }

    get crossDomainImports(): boolean {
        return !!this.permissions?.crossDomainImports;
    }

    get hasProps(): boolean {
        return this.props.size > 0;
    }

    get hasAttrs(): boolean {
        return this.attrs.size > 0;
    }

    checkRestrictedProp(key: string): boolean {
        if (!this.props.has(key)) return false;
        this.warnRestricted(key);
        return true;
    }

    redirectRestrictedProp(target: any, key: string, value: any): boolean {
        if (!this.props.has(key)) return false;
        const setting = this.props.get(key);
        const { allowCrossDomain, allowFromSameDomain } = setting || {};

        if (allowCrossDomain) {
            return this.applyAllowedSetting(setting, target, key, value);
        }

        if (allowFromSameDomain) {
            if (isAllowedUrl(value)) {
                return this.applyAllowedSetting(setting, target, key, value);
            }
            this.warnRestricted(key);
            return true;
        }

        if (setting?.useMethod) {
            const method = target?.[setting.useMethod];
            if (typeof method === 'function') {
                method.call(target, value);
                return true;
            }
        }

        this.warnRestricted(key);
        return true;
    }

    checkRestrictedAttributeCall(
        methodName: string,
        args: any[]
    ): { blocked: boolean; attrName?: string } {
        if (methodName !== 'setAttribute' || args.length === 0 || this.attrs.size === 0) {
            return { blocked: false };
        }
        const attrName = String(args[0]);
        if (!this.attrs.has(attrName)) {
            return { blocked: false };
        }
        const setting = this.attrs.get(attrName);
        const value = args[1];
        const { allowCrossDomain, allowFromSameDomain } = setting || {};

        if (allowCrossDomain) {
            return { blocked: false, attrName };
        }

        if (allowFromSameDomain) {
            if (isAllowedUrl(value)) {
                return { blocked: false, attrName };
            }
            this.warnRestricted(attrName);
            return { blocked: true, attrName };
        }

        this.warnRestricted(attrName);
        return { blocked: true, attrName };
    }

    private applyAllowedSetting(
        setting: RestrictedPropSetting | undefined,
        target: any,
        key: string,
        value: any
    ): boolean {
        if (setting?.useMethod) {
            const method = target?.[setting.useMethod];
            if (typeof method === 'function') {
                method.call(target, value);
                return true;
            }
            this.warnRestricted(key);
            return true;
        }
        return false;
    }

    private warnRestricted(key: string): void {
        if (!this.warned.has(key)) {
            this.warned.add(key);
            console.warn(`assignGingerly: property '${key}' is in restrictedPropSettings — assignment skipped.`);
        }
    }
}

function buildMaps(permissions: AssignPermissions | undefined): RestrictedPropSettingsMap {
    const settings = permissions?.restrictedPropSettings;
    const props = new Map<string, RestrictedPropSetting | undefined>();
    const attrs = new Map<string, RestrictedPropSetting | undefined>();
    if (!settings || settings.length === 0) {
        return { props, attrs };
    }

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

function normalizeStrings(value: string | string[] | undefined): string[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

function normalizeAttrNames(
    attr: boolean | string | string[] | undefined,
    propNames: string[]
): string[] {
    if (attr === undefined || attr === false) return [];
    if (attr === true) return propNames;
    return normalizeStrings(attr);
}

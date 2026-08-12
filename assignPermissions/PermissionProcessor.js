import { isAllowedUrl } from './isAllowedUrl.js';
import { getValue } from '../resolve/getValues.js';
export class PermissionProcessor {
    constructor(permissions) {
        this.permissions = permissions;
        const { props, attrs } = buildMaps(permissions);
        this.props = props;
        this.attrs = attrs;
        const { blockedMethods, configuredMethods } = buildMethodMaps(permissions);
        this.blockedMethods = blockedMethods;
        this.configuredMethods = configuredMethods;
        this.warned = new Set();
        this.warnedMethods = new Set();
    }
    get crossDomainImports() {
        return !!this.permissions?.crossDomainImports;
    }
    get hasProps() {
        return this.props.size > 0;
    }
    get hasAttrs() {
        return this.attrs.size > 0;
    }
    checkRestrictedProp(key) {
        if (!this.props.has(key))
            return false;
        this.warnRestricted(key);
        return true;
    }
    checkRestrictedMethod(methodName) {
        if (!this.blockedMethods.has(methodName))
            return false;
        this.warnRestrictedMethod(methodName);
        return true;
    }
    getMethodAppendArgs(methodName) {
        const config = this.configuredMethods.get(methodName);
        if (!config)
            return undefined;
        const rawArgs = config.appendArgs ?? config.addArgs;
        if (!rawArgs || rawArgs.length === 0)
            return undefined;
        const resolved = [];
        for (const arg of rawArgs) {
            if (typeof arg === 'string' && arg.startsWith('?.')) {
                resolved.push(getValue(arg, this.permissions));
            }
            else {
                resolved.push(arg);
            }
        }
        return resolved;
    }
    redirectRestrictedProp(target, key, value) {
        if (!this.props.has(key))
            return false;
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
    checkRestrictedAttributeCall(methodName, args) {
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
    applyAllowedSetting(setting, target, key, value) {
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
    warnRestricted(key) {
        if (!this.warned.has(key)) {
            this.warned.add(key);
            console.warn(`assignGingerly: property '${key}' is in restrictedPropSettings — assignment skipped.`);
        }
    }
    warnRestrictedMethod(methodName) {
        if (!this.warnedMethods.has(methodName)) {
            this.warnedMethods.add(methodName);
            console.warn(`assignGingerly: method '${methodName}' is in restrictedMethodSettings — method call skipped.`);
        }
    }
}
function buildMaps(permissions) {
    const settings = permissions?.restrictedPropSettings;
    const props = new Map();
    const attrs = new Map();
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
function normalizeStrings(value) {
    if (value === undefined)
        return [];
    return Array.isArray(value) ? value : [value];
}
function normalizeAttrNames(attr, propNames) {
    if (attr === undefined || attr === false)
        return [];
    if (attr === true)
        return propNames;
    return normalizeStrings(attr);
}
function buildMethodMaps(permissions) {
    const methodSettings = permissions?.restrictedMethodSettings;
    const blockedMethods = new Set();
    const configuredMethods = new Map();
    if (!methodSettings || methodSettings.length === 0) {
        return { blockedMethods, configuredMethods };
    }
    for (const setting of methodSettings) {
        if (typeof setting === 'string') {
            blockedMethods.add(setting);
            continue;
        }
        if (configuredMethods.has(setting.method)) {
            throw new Error(`assignGingerly: duplicate restrictedMethodSettings entry for '${setting.method}'.`);
        }
        configuredMethods.set(setting.method, setting);
    }
    return { blockedMethods, configuredMethods };
}

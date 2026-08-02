/*******************************************************************************************
@Name           util/namespace
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    The fixed Imhotep managed-package namespace and helpers to prepend it to
                object/field API names. The namespace is HARD-CODED, not configurable
                (plan §5.5, §7.4). Tool inputs stay namespace-free; the server prefixes.
*******************************************************************************************/

/** The fixed managed-package namespace. Not a config key — hard-coded by design (§7.4). */
export const NAMESPACE = 'iab__';

/**
 * Prepend the namespace to an un-prefixed API name, unless it's a standard field/object
 * (no `__c`/`__` custom suffix, e.g. "Name", "Id", "CreatedDate") or already prefixed.
 *
 * Examples: nsApiName("Story__c") → "iab__Story__c"; nsApiName("Name") → "Name";
 *           nsApiName("iab__Story__c") → "iab__Story__c" (idempotent).
 */
export function nsApiName(apiName: string): string {
  if (apiName.startsWith(NAMESPACE)) return apiName;
  // Standard fields/objects (no custom "__" segment) are never namespaced.
  if (!apiName.includes('__')) return apiName;
  return `${NAMESPACE}${apiName}`;
}

/** Strip the namespace from an API name, if present (for presenting results namespace-free). */
export function stripNamespace(apiName: string): string {
  return apiName.startsWith(NAMESPACE) ? apiName.slice(NAMESPACE.length) : apiName;
}

/*******************************************************************************************
@Name           salesforce/query
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Shared SOQL helpers used by every read tool: build namespaced SELECT field
                lists from the config field map, escape SOQL string literals, and shape a raw
                SObject row back into a namespace-free, logical-keyed result object. Keeps the
                tools thin and the field mapping in exactly one place (plan §4.1, §5.5).
*******************************************************************************************/

import type { ObjectConfig } from '../config/schema.js';
import { nsApiName } from '../util/namespace.js';

/** A logical→API field pairing (API name already namespaced). */
export interface SelectField {
  logical: string;
  api: string;
}

/** Build the logical→namespaced-API field list for an object from its config field map. */
export function selectFields(obj: ObjectConfig): SelectField[] {
  return Object.entries(obj.fields).map(([logical, api]) => ({ logical, api: nsApiName(api) }));
}

/** The `SELECT` column list (Id first, then the object's mapped fields), namespaced. */
export function selectClause(obj: ObjectConfig): string {
  return ['Id', ...selectFields(obj).map((f) => f.api)].join(', ');
}

/** Escape a value for safe inclusion in a SOQL string literal. */
export function soqlEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Shape a raw SObject row into a namespace-free, logical-keyed object: `{ id, <logical>: value }`.
 * Unmapped/absent fields default to null. Nested sub-records are left to the caller to shape.
 */
export function shapeRecord(
  row: Record<string, unknown>,
  fields: SelectField[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.Id };
  for (const { logical, api } of fields) {
    out[logical] = row[api] ?? null;
  }
  return out;
}

/*******************************************************************************************
@Name           config/schema
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Type definitions for the Imhotep MCP configuration shape — the shipped
                defaults (config.default.json) deep-merged with the customer's global and
                project overrides. See plan §7.
*******************************************************************************************/

/** Logical-name → Salesforce API-name map for one object's fields (API names un-prefixed). */
export type FieldMap = Record<string, string>;

/** Per-field validation rule the server enforces before write (plan §5.2, sub-inc 7a). */
export interface FieldRule {
  /** Max character length; a longer value is rejected before the API call. */
  maxLength?: number;
}

/** Per-object schema description carried in config. */
export interface ObjectConfig {
  /** Object API name, un-prefixed (e.g. "Story__c"); the namespace is prepended at runtime. */
  apiName: string;
  /** Salesforce key prefix (e.g. "a0X"), if known; used for wrong-object paste detection (v1.1). */
  keyPrefix?: string | null;
  /** The Name field API name (usually "Name"). */
  nameField?: string;
  /** For Story: the auto-number field (e.g. "Story_Number__c"). */
  storyNumberField?: string;
  /** Logical → API name field map. */
  fields: FieldMap;
  /** Logical field name → validation rule (max length, …) enforced before write. */
  fieldRules?: Record<string, FieldRule>;
  /** Logical field names that hold rich text (HTML ⇄ Markdown). */
  richTextFields?: string[];
  /** Logical picklist name → allowed values. */
  picklists?: Record<string, string[]>;
  /** Record-type configuration (DeveloperNames + shipped default). */
  recordTypes?: {
    available: string[];
    default: string;
  };
  /** Logical include-name → child-relationship API name (un-prefixed), for subqueries. */
  childRelationships?: Record<string, string>;
}

/** Structural rules the server enforces. */
export interface Invariants {
  /** Story.Project must equal its Release's Project (plan §5.2, §5.5). */
  storyProjectEqualsReleaseProject?: boolean;
}

/** Shipped default `include` set for a get_* tool when the caller omits `include` (§5.4). */
export interface IncludeDefault {
  include: string[];
}

/**
 * The full effective configuration after merging defaults + global + project.
 * Customer override files are partial (any subset of these keys) and deep-merged on top.
 */
export interface ImhotepConfig {
  /** Salesforce API version to target; capped to the org's max at connect time (§0). */
  apiVersion: string;

  /** Per-object schema (project / release / story, plus more as tools land). */
  objects: Record<string, ObjectConfig>;

  /** Structural invariants the server enforces. */
  invariants?: Invariants;

  /** System-maintained fields the server refuses to write, keyed by object logical name. */
  readOnlyFields?: Record<string, string[]>;

  /** Default include sets for get_* tools. */
  defaults?: Record<string, IncludeDefault>;

  // --- Customer-override-only keys (absent from shipped defaults; §7.4) ---

  /** Default org (an `sf` CLI alias/username) where Imhotep is installed. */
  defaultImhotepOrg?: string;
  /** When true, permits unattended writes (default OFF; §6). */
  autonomousMode?: boolean;
  /** When true (default), the server auto-installs/refreshes the shipped skill on start (§4.3). */
  skillAutoInstall?: boolean;
  /** Default working-context Imhotep Project (name, Id, or URL). */
  defaultImhotepProject?: string;
  /** Current working-context Imhotep Release (name, Id, or URL). */
  currentImhotepRelease?: string;

  /**
   * @deprecated Renamed to `defaultImhotepOrg` (sub-inc 7a). Still read for back-compat;
   * the loader normalizes it into the new key and warns. Remove in a future major.
   */
  defaultOrg?: string;
  /**
   * @deprecated Renamed to `defaultImhotepProject` (sub-inc 7a). Still read for back-compat;
   * the loader normalizes it into the new key and warns. Remove in a future major.
   */
  defaultProject?: string;
  /**
   * @deprecated Renamed to `currentImhotepRelease` (sub-inc 7a). Still read for back-compat;
   * the loader normalizes it into the new key and warns. Remove in a future major.
   */
  currentRelease?: string;
  /** Custom fields the customer added to managed objects, by object → logical → API name. */
  customFields?: Record<string, FieldMap>;
}

/** The scope a config value came from / is written to. */
export type ConfigScope = 'default' | 'global' | 'project';

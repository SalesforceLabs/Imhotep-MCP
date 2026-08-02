/*******************************************************************************************
@Name           salesforce/errors
@Author         Mitch Lynch (mitch.lynch@salesforce.com)
@Copyright      Copyright (c) 2026 Salesforce, Inc. All rights reserved.
@Date           8/2/2026
@Description    Translate raw Salesforce API errors into plain-language messages that name
                the object, field, and org, so the user understands WHY and WHERE. Salesforce
                is the enforcement point; this just makes its refusals legible (plan §6).
                The substantive detail stays literal so subagents can still parse it.
*******************************************************************************************/

/** Normalized error fields we can pull off a jsforce/Salesforce error. */
interface SalesforceErrorLike {
  errorCode: string | undefined;
  name: string | undefined;
  message: string | undefined;
  fields: string[] | undefined;
}

/** Context passed in so messages can name the org and (when known) the object. */
export interface ErrorContext {
  /** The org target (alias/username) the call ran against. */
  org?: string;
  /** The Imhotep object involved (e.g. "Story"), if the caller knows it. */
  object?: string;
}

function pick(err: unknown): SalesforceErrorLike {
  const e = (err ?? {}) as Record<string, unknown>;
  return {
    errorCode: typeof e.errorCode === 'string' ? e.errorCode : undefined,
    name: typeof e.name === 'string' ? e.name : undefined,
    message: typeof e.message === 'string' ? e.message : undefined,
    fields: Array.isArray(e.fields) ? (e.fields as string[]) : undefined,
  };
}

function whereClause(ctx: ErrorContext): string {
  const parts: string[] = [];
  if (ctx.object) parts.push(`on ${ctx.object}`);
  if (ctx.org && ctx.org !== '(default)') parts.push(`in org "${ctx.org}"`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/**
 * Translate a Salesforce error into a plain-language message. Recognizes the common
 * access/FLS/validation codes (§6); falls back to the raw message for anything else,
 * always appending the org/object context so the user knows where it happened.
 */
export function translateSalesforceError(err: unknown, ctx: ErrorContext = {}): string {
  const { errorCode, name, message, fields } = pick(err);
  const code = errorCode ?? name ?? '';
  const where = whereClause(ctx);
  const fieldList = fields && fields.length ? ` Field(s): ${fields.join(', ')}.` : '';

  switch (code) {
    case 'INSUFFICIENT_ACCESS_OR_READONLY':
    case 'INSUFFICIENT_ACCESS':
      return (
        `You don't have permission to perform this operation${where}. ` +
        `Your Salesforce user lacks the required object/field access or the field is read-only.${fieldList}`
      );
    case 'INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY':
      return `You don't have access to a related record needed for this operation${where}.${fieldList}`;
    case 'FIELD_CUSTOM_VALIDATION_EXCEPTION':
      return `A validation rule blocked this operation${where}: ${message ?? 'validation failed'}.`;
    case 'FIELD_FILTER_VALIDATION_EXCEPTION':
      return `A value failed a lookup/filter validation${where}: ${message ?? 'invalid reference'}.${fieldList}`;
    case 'REQUIRED_FIELD_MISSING':
      return `A required field is missing${where}.${fieldList}`;
    case 'INVALID_FIELD':
    case 'INVALID_FIELD_FOR_INSERT_UPDATE':
      return `A field can't be written${where}: ${message ?? 'invalid field'}.${fieldList}`;
    case 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST':
      return `A picklist value isn't allowed${where}: ${message ?? 'invalid picklist value'}.${fieldList}`;
    case 'MALFORMED_ID':
      return `That doesn't look like a valid Salesforce record Id${where}: ${message ?? ''}`.trim() + '.';
    case 'ENTITY_IS_DELETED':
      return `That record has been deleted${where}.`;
    case 'INVALID_SESSION_ID':
      return `Your Salesforce session expired and could not be refreshed${where}. Try \`sf org login web\`.`;
    default:
      return message ? `${message}${where}` : `Salesforce returned an error${where}.`;
  }
}

/** Wrap-and-rethrow: translate a Salesforce error into a clean Error for the tool layer. */
export class ImhotepError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImhotepError';
  }
}

export function toImhotepError(err: unknown, ctx: ErrorContext = {}): ImhotepError {
  if (err instanceof ImhotepError) return err;
  return new ImhotepError(translateSalesforceError(err, ctx), err);
}

import { describe, it, expect } from 'vitest';
import { translateSalesforceError, toImhotepError, ImhotepError } from '../src/salesforce/errors.js';

describe('translateSalesforceError', () => {
  it('translates insufficient access, naming object and org', () => {
    const msg = translateSalesforceError(
      { errorCode: 'INSUFFICIENT_ACCESS_OR_READONLY', message: 'no access' },
      { org: 'gps-prod', object: 'Story' },
    );
    expect(msg).toMatch(/don't have permission/i);
    expect(msg).toContain('on Story');
    expect(msg).toContain('org "gps-prod"');
  });

  it('surfaces validation-rule messages', () => {
    const msg = translateSalesforceError(
      { errorCode: 'FIELD_CUSTOM_VALIDATION_EXCEPTION', message: 'Project must match Release' },
      { object: 'Story' },
    );
    expect(msg).toContain('validation rule');
    expect(msg).toContain('Project must match Release');
  });

  it('includes offending field names when provided', () => {
    const msg = translateSalesforceError(
      { errorCode: 'REQUIRED_FIELD_MISSING', fields: ['iab__Release__c'] },
      {},
    );
    expect(msg).toContain('iab__Release__c');
  });

  it('falls back to the raw message for unknown codes', () => {
    const msg = translateSalesforceError({ message: 'Something odd happened' }, { org: 'x' });
    expect(msg).toContain('Something odd happened');
  });

  it('omits org context for the default org', () => {
    const msg = translateSalesforceError({ message: 'boom' }, { org: '(default)' });
    expect(msg).not.toContain('org "');
  });
});

describe('toImhotepError', () => {
  it('wraps into an ImhotepError with a translated message', () => {
    const e = toImhotepError({ errorCode: 'ENTITY_IS_DELETED' }, { object: 'Story' });
    expect(e).toBeInstanceOf(ImhotepError);
    expect(e.message).toMatch(/deleted/i);
  });
  it('passes through an existing ImhotepError unchanged', () => {
    const original = new ImhotepError('already translated');
    expect(toImhotepError(original)).toBe(original);
  });
});

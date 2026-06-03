// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { decideAccess } from './_access';

describe('decideAccess', () => {
  it('block always denies', () => {
    expect(decideAccess({ guildAllowed: true, access: 'block' })).toBe(false);
    expect(decideAccess({ guildAllowed: false, access: 'block' })).toBe(false);
  });

  it('allow always admits', () => {
    expect(decideAccess({ guildAllowed: true, access: 'allow' })).toBe(true);
    expect(decideAccess({ guildAllowed: false, access: 'allow' })).toBe(true);
  });

  it('default and null follow the guild rule', () => {
    expect(decideAccess({ guildAllowed: true, access: 'default' })).toBe(true);
    expect(decideAccess({ guildAllowed: false, access: 'default' })).toBe(false);
    expect(decideAccess({ guildAllowed: true, access: null })).toBe(true);
    expect(decideAccess({ guildAllowed: false, access: null })).toBe(false);
  });
});

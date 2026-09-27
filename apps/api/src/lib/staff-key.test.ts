import { describe, expect, it } from 'vitest';
import { generateStaffKey, hashStaffKey, parseStaffKey } from './staff-key';

describe('generateStaffKey', () => {
  it('makes a prefixed 256-bit key', () => {
    expect(generateStaffKey()).toMatch(/^rsk_[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 1000 }, generateStaffKey));
    expect(keys.size).toBe(1000);
  });
});

describe('hashStaffKey', () => {
  it('is stable, so a stored hash can be looked up', () => {
    const key = generateStaffKey();
    expect(hashStaffKey(key)).toBe(hashStaffKey(key));
  });

  it('never contains the key itself', () => {
    const key = generateStaffKey();
    expect(hashStaffKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashStaffKey(key)).not.toContain(key.slice(4));
  });
});

describe('parseStaffKey', () => {
  const key = generateStaffKey();

  it('reads a bearer key', () => {
    expect(parseStaffKey(`Bearer ${key}`)).toBe(key);
  });

  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['a key without "Bearer"', key],
    ['lower-case "bearer"', `bearer ${key}`],
    ['basic auth', 'Basic dXNlcjpwYXNz'],
    ['a key with the wrong prefix', `Bearer sk_${key.slice(4)}`],
    ['a truncated key', `Bearer ${key.slice(0, -1)}`],
    ['trailing text', `Bearer ${key} extra`],
  ])('rejects %s', (_label, header) => {
    expect(parseStaffKey(header)).toBeNull();
  });
});

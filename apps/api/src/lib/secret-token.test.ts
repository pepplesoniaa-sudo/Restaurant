import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, matchesHash, parseBearerToken } from './secret-token';
import { generateStaffKey, parseStaffKey } from './staff-key';
import { generateTrackingToken, parseTrackingToken } from './tracking-token';

describe('generateToken', () => {
  it('makes a prefixed 256-bit token that never repeats', () => {
    const tokens = Array.from({ length: 1000 }, () => generateToken('abc_'));
    expect(tokens.every((t) => /^abc_[A-Za-z0-9_-]{43}$/.test(t))).toBe(true);
    expect(new Set(tokens).size).toBe(1000);
  });
});

describe('matchesHash', () => {
  const token = generateTrackingToken();

  it('accepts the token whose hash is stored', () => {
    expect(matchesHash(token, hashToken(token))).toBe(true);
  });

  it('rejects any other token', () => {
    expect(matchesHash(generateTrackingToken(), hashToken(token))).toBe(false);
  });

  it('rejects everything when no hash is stored', () => {
    expect(matchesHash(token, null)).toBe(false);
  });

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(matchesHash(token, 'abc')).toBe(false);
  });
});

describe('parseBearerToken', () => {
  it('only accepts the requested kind', () => {
    const key = generateStaffKey();
    const tracking = generateTrackingToken();

    expect(parseBearerToken(`Bearer ${key}`, 'rsk_')).toBe(key);
    expect(parseStaffKey(`Bearer ${tracking}`)).toBeNull();
    expect(parseTrackingToken(`Bearer ${key}`)).toBeNull();
    expect(parseTrackingToken(`Bearer ${tracking}`)).toBe(tracking);
  });
});

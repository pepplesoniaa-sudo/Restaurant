import { afterEach, describe, expect, it, vi } from 'vitest';
import { log, maskPhones } from './log';

describe('maskPhones', () => {
  it('keeps only the country code and the last three digits', () => {
    expect(maskPhones('+2348031234567')).toBe('+234*******567');
  });

  it('masks every phone in a longer message', () => {
    expect(maskPhones('phone +2348031234567 and +2349012345678 clashed')).toBe(
      'phone +234*******567 and +234*******678 clashed',
    );
  });

  it('leaves other text alone', () => {
    expect(maskPhones('order clx8k2j9d0000qz8h3v1f7a2b total 150000')).toBe(
      'order clx8k2j9d0000qz8h3v1f7a2b total 150000',
    );
  });
});

describe('log.error', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never writes a full phone number, even from inside an error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    log.error('place order failed', {
      err: new Error('Unique constraint on phone +2348031234567'),
    });

    const written = spy.mock.calls.flat().join(' ');
    expect(written).not.toContain('+2348031234567');
    expect(written).toContain('+234*******567');
  });
});

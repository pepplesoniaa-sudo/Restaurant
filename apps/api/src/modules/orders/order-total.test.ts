import { describe, expect, it } from 'vitest';
import { computeOrderTotal } from './order-total';

describe('computeOrderTotal', () => {
  it('adds unitPrice × quantity for every line, plus the delivery fee', () => {
    const lines = [
      { unitPrice: 350000, quantity: 2 }, // ₦3,500 × 2
      { unitPrice: 150000, quantity: 1 }, // ₦1,500
    ];
    expect(computeOrderTotal(lines, 150000)).toBe(1000000); // ₦10,000
  });

  it('adds nothing for free delivery', () => {
    expect(computeOrderTotal([{ unitPrice: 99, quantity: 3 }], 0)).toBe(297);
  });

  it('stays exact where floating-point naira would drift', () => {
    // 0.1 + 0.2 !== 0.3 in naira; in kobo it is exactly 30.
    expect(
      computeOrderTotal(
        [
          { unitPrice: 10, quantity: 1 },
          { unitPrice: 20, quantity: 1 },
        ],
        0,
      ),
    ).toBe(30);
  });

  it.each([
    ['a fractional unitPrice', [{ unitPrice: 1.5, quantity: 1 }], 0],
    ['a negative unitPrice', [{ unitPrice: -100, quantity: 1 }], 0],
    ['a fractional delivery fee', [{ unitPrice: 100, quantity: 1 }], 0.5],
    ['a negative delivery fee', [{ unitPrice: 100, quantity: 1 }], -1],
    ['a zero quantity', [{ unitPrice: 100, quantity: 0 }], 0],
    ['a fractional quantity', [{ unitPrice: 100, quantity: 1.5 }], 0],
  ])('refuses %s', (_label, lines, deliveryFee) => {
    expect(() => computeOrderTotal(lines, deliveryFee)).toThrow(RangeError);
  });
});

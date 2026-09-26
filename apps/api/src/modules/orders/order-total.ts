// Money is whole kobo (README, Money is whole kobo). These functions take and return integers only.

import { MAX_INT4 } from '@restaurant/contracts';

/** Every money column is a Postgres INTEGER, so no amount can go above this. */
export const MAX_KOBO = MAX_INT4;

export type PricedLine = { unitPrice: number; quantity: number };

function assertKobo(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of kobo, got ${value}`);
  }
}

/**
 * total = sum of (unitPrice × quantity) + deliveryFee (README, Rules the data must keep).
 * Inputs must already come from the database, never from the client.
 */
export function computeOrderTotal(lines: readonly PricedLine[], deliveryFee: number): number {
  assertKobo('deliveryFee', deliveryFee);
  let total = deliveryFee;
  for (const line of lines) {
    assertKobo('unitPrice', line.unitPrice);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError(`quantity must be a whole number of 1 or more, got ${line.quantity}`);
    }
    total += line.unitPrice * line.quantity;
  }
  return total;
}

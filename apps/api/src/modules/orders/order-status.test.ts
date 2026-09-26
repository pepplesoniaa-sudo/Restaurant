import { OrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { canTransition, isFinal } from './order-status';

// Every allowed move, written out from the README diagram. Anything not listed is forbidden.
const ALLOWED = new Set([
  'PENDING->CONFIRMED',
  'CONFIRMED->PREPARING',
  'PREPARING->OUT_FOR_DELIVERY',
  'OUT_FOR_DELIVERY->DELIVERED',
  'PENDING->CANCELLED',
  'CONFIRMED->CANCELLED',
  'PREPARING->CANCELLED',
]);

const statuses = Object.values(OrderStatus);

describe('canTransition', () => {
  for (const from of statuses) {
    for (const to of statuses) {
      const allowed = ALLOWED.has(`${from}->${to}`);
      it(`${allowed ? 'allows' : 'forbids'} ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(allowed);
      });
    }
  }

  it('forbids skipping a step', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.PREPARING)).toBe(false);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.DELIVERED)).toBe(false);
  });

  it('forbids moving backwards', () => {
    expect(canTransition(OrderStatus.PREPARING, OrderStatus.CONFIRMED)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.PENDING)).toBe(false);
  });

  it('forbids cancelling once out for delivery', () => {
    expect(canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED)).toBe(false);
  });
});

describe('isFinal', () => {
  it('treats only DELIVERED and CANCELLED as final', () => {
    expect(statuses.filter(isFinal).sort()).toEqual([OrderStatus.CANCELLED, OrderStatus.DELIVERED]);
  });
});

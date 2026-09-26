import { describe, expect, it } from 'vitest';
import { MAX_KOBO } from './order-total';
import { priceOrder, type MenuItemForPricing, type RequestedLine } from './price-order';

const restaurantId = 'clrest000000000000000000a';
const otherRestaurantId = 'clrest000000000000000000b';

const jollof: MenuItemForPricing = {
  id: 'clitem00000000000000jollof',
  restaurantId,
  price: 350000,
  available: true,
};
const chapman: MenuItemForPricing = {
  id: 'clitem0000000000000chapman',
  restaurantId,
  price: 150000,
  available: true,
};
const hidden: MenuItemForPricing = {
  id: 'clitem00000000000000hidden',
  restaurantId,
  price: 200000,
  available: false,
};
const suya: MenuItemForPricing = {
  id: 'clitem000000000000000suya',
  restaurantId: otherRestaurantId,
  price: 250000,
  available: true,
};

const menuItems = [jollof, chapman, hidden, suya];

function price(requested: RequestedLine[], deliveryFee = 150000) {
  return priceOrder({ restaurantId, deliveryFee, requested, menuItems });
}

describe('priceOrder', () => {
  it('prices each line from the database and computes the total', () => {
    const result = price([
      { menuItemId: jollof.id, quantity: 2 },
      { menuItemId: chapman.id, quantity: 1 },
    ]);

    expect(result).toEqual({
      ok: true,
      order: {
        lines: [
          { menuItemId: jollof.id, quantity: 2, unitPrice: 350000 },
          { menuItemId: chapman.id, quantity: 1, unitPrice: 150000 },
        ],
        total: 1000000,
      },
    });
  });

  it('ignores any price or total the client tried to send (rule A)', () => {
    const tampered = [{ menuItemId: jollof.id, quantity: 1, unitPrice: 1, price: 1, total: 1 }];

    const result = price(tampered);

    expect(result).toEqual({
      ok: true,
      order: { lines: [{ menuItemId: jollof.id, quantity: 1, unitPrice: 350000 }], total: 500000 },
    });
  });

  it('rejects an item from another restaurant (rule B)', () => {
    expect(
      price([
        { menuItemId: jollof.id, quantity: 1 },
        { menuItemId: suya.id, quantity: 1 },
      ]),
    ).toEqual({
      ok: false,
      rejection: { reason: 'ITEM_FROM_OTHER_RESTAURANT', menuItemId: suya.id },
    });
  });

  it('rejects an unavailable item (rule C)', () => {
    expect(price([{ menuItemId: hidden.id, quantity: 1 }])).toEqual({
      ok: false,
      rejection: { reason: 'ITEM_UNAVAILABLE', menuItemId: hidden.id },
    });
  });

  it('rejects an item that does not exist', () => {
    const menuItemId = 'clitem000000000000missing';
    expect(price([{ menuItemId, quantity: 1 }])).toEqual({
      ok: false,
      rejection: { reason: 'ITEM_NOT_FOUND', menuItemId },
    });
  });

  it('rejects an order with no items', () => {
    expect(price([])).toEqual({ ok: false, rejection: { reason: 'NO_ITEMS' } });
  });

  it('rejects the same item listed twice', () => {
    expect(
      price([
        { menuItemId: jollof.id, quantity: 1 },
        { menuItemId: jollof.id, quantity: 2 },
      ]),
    ).toEqual({ ok: false, rejection: { reason: 'DUPLICATE_ITEM', menuItemId: jollof.id } });
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_KOBO + 1])('rejects quantity %s', (quantity) => {
    expect(price([{ menuItemId: jollof.id, quantity }])).toEqual({
      ok: false,
      rejection: { reason: 'INVALID_QUANTITY', menuItemId: jollof.id },
    });
  });

  it('rejects a total too large for the database column', () => {
    expect(price([{ menuItemId: jollof.id, quantity: 10_000 }])).toEqual({
      ok: false,
      rejection: { reason: 'TOTAL_TOO_LARGE' },
    });
  });

  it('accepts a total exactly at the column limit', () => {
    const exact: MenuItemForPricing = {
      id: 'clitem0000000000000000one',
      restaurantId,
      price: 1,
      available: true,
    };
    const result = priceOrder({
      restaurantId,
      deliveryFee: 0,
      requested: [{ menuItemId: exact.id, quantity: MAX_KOBO }],
      menuItems: [exact],
    });

    expect(result.ok && result.order.total).toBe(MAX_KOBO);
  });
});

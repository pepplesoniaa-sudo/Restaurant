import { computeOrderTotal, MAX_KOBO } from './order-total';

// Turns what the customer asked for into order lines priced from the database. Every Section 3
// rule about placing an order is checked here, so it can be tested without a database.

export type RequestedLine = { menuItemId: string; quantity: number };

/** A menu item as loaded from the database. */
export type MenuItemForPricing = {
  id: string;
  restaurantId: string;
  price: number;
  available: boolean;
};

export type PricedOrderLine = { menuItemId: string; quantity: number; unitPrice: number };

export type PricedOrder = { lines: PricedOrderLine[]; total: number };

export type OrderRejection =
  | { reason: 'NO_ITEMS' }
  | { reason: 'INVALID_QUANTITY'; menuItemId: string }
  | { reason: 'DUPLICATE_ITEM'; menuItemId: string }
  | { reason: 'ITEM_NOT_FOUND'; menuItemId: string }
  | { reason: 'ITEM_FROM_OTHER_RESTAURANT'; menuItemId: string }
  | { reason: 'ITEM_UNAVAILABLE'; menuItemId: string }
  | { reason: 'TOTAL_TOO_LARGE' };

export type PriceOrderResult =
  { ok: true; order: PricedOrder } | { ok: false; rejection: OrderRejection };

export function priceOrder(input: {
  restaurantId: string;
  deliveryFee: number;
  requested: readonly RequestedLine[];
  menuItems: readonly MenuItemForPricing[];
}): PriceOrderResult {
  if (input.requested.length === 0) return reject({ reason: 'NO_ITEMS' });

  const menuItemsById = new Map(input.menuItems.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const lines: PricedOrderLine[] = [];

  for (const { menuItemId, quantity } of input.requested) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_KOBO) {
      return reject({ reason: 'INVALID_QUANTITY', menuItemId });
    }
    if (seen.has(menuItemId)) return reject({ reason: 'DUPLICATE_ITEM', menuItemId });
    seen.add(menuItemId);

    const item = menuItemsById.get(menuItemId);
    if (item === undefined) return reject({ reason: 'ITEM_NOT_FOUND', menuItemId });
    // Rule B: one restaurant per order.
    if (item.restaurantId !== input.restaurantId) {
      return reject({ reason: 'ITEM_FROM_OTHER_RESTAURANT', menuItemId });
    }
    // Rule C: hidden items can't be ordered.
    if (!item.available) return reject({ reason: 'ITEM_UNAVAILABLE', menuItemId });

    // Rule A: the price is copied from the database, whatever the client sent.
    lines.push({ menuItemId, quantity, unitPrice: item.price });
  }

  const total = computeOrderTotal(lines, input.deliveryFee);
  if (total > MAX_KOBO) return reject({ reason: 'TOTAL_TOO_LARGE' });

  return { ok: true, order: { lines, total } };
}

function reject(rejection: OrderRejection): PriceOrderResult {
  return { ok: false, rejection };
}

/** A caller-facing sentence for a rejection. Only ids the caller sent appear in it. */
export function describeRejection(rejection: OrderRejection): string {
  switch (rejection.reason) {
    case 'NO_ITEMS':
      return 'An order needs at least one item';
    case 'INVALID_QUANTITY':
      return `Menu item ${rejection.menuItemId} needs a whole-number quantity of 1 or more`;
    case 'DUPLICATE_ITEM':
      return `Menu item ${rejection.menuItemId} is listed more than once; combine the quantities`;
    case 'ITEM_NOT_FOUND':
      return `Menu item ${rejection.menuItemId} does not exist`;
    case 'ITEM_FROM_OTHER_RESTAURANT':
      return `Menu item ${rejection.menuItemId} belongs to another restaurant; an order comes from one restaurant`;
    case 'ITEM_UNAVAILABLE':
      return `Menu item ${rejection.menuItemId} is not available`;
    case 'TOTAL_TOO_LARGE':
      return 'The order total is too large';
  }
}

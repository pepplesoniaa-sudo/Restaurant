import type { PlacedOrderView, PlaceOrderInput } from '@restaurant/contracts';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/secret-token';
import { generateTrackingToken } from '@/lib/tracking-token';
import { priceOrder, type OrderRejection } from './price-order';

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrderView }
  | { ok: false; rejection: OrderRejection | { reason: 'RESTAURANT_NOT_FOUND' } };

/**
 * Places an order (README, Access). Prices, the delivery fee and the total all come from the
 * database; the input only says what was asked for and who is asking.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  return db.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { id: true, deliveryFee: true },
    });
    if (restaurant === null) return { ok: false, rejection: { reason: 'RESTAURANT_NOT_FOUND' } };

    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: input.items.map((item) => item.menuItemId) } },
      select: { id: true, restaurantId: true, price: true, available: true },
    });

    // Priced before the customer is touched, so a rejected order leaves nothing behind.
    const priced = priceOrder({
      restaurantId: restaurant.id,
      deliveryFee: restaurant.deliveryFee,
      requested: input.items,
      menuItems,
    });
    if (!priced.ok) return priced;

    // An existing customer keeps their stored name and area; only a new phone creates a record.
    const customer = await tx.customer.upsert({
      where: { phone: input.customer.phone },
      update: {},
      create: input.customer,
      select: { id: true },
    });

    // The customer's only way to check on this order later; only its hash is kept.
    const trackingToken = generateTrackingToken();

    const order = await tx.order.create({
      data: {
        trackingTokenHash: hashToken(trackingToken),
        customerId: customer.id,
        restaurantId: restaurant.id,
        total: priced.order.total,
        items: { create: priced.order.lines },
      },
      select: {
        id: true,
        restaurantId: true,
        status: true,
        total: true,
        createdAt: true,
        items: { select: { menuItemId: true, quantity: true, unitPrice: true } },
      },
    });

    return {
      ok: true,
      order: { ...order, createdAt: order.createdAt.toISOString(), trackingToken },
    };
  });
}

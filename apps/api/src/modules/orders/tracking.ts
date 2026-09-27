import type { Prisma } from '@prisma/client';
import type { TrackedOrderView } from '@restaurant/contracts';
import { db } from '@/lib/db';
import { matchesHash } from '@/lib/secret-token';

// A customer checking on the one order they placed (README, Tracking an order). The token opens
// that order only, for reading only, and no customer data is ever selected.

const trackedOrderSelect = {
  id: true,
  restaurantId: true,
  status: true,
  total: true,
  createdAt: true,
  trackingTokenHash: true,
  items: {
    select: {
      menuItemId: true,
      quantity: true,
      unitPrice: true,
      menuItem: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.OrderSelect;

type TrackedOrderRow = Prisma.OrderGetPayload<{ select: typeof trackedOrderSelect }>;

export function toTrackedOrderView(row: TrackedOrderRow): TrackedOrderView {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    status: row.status,
    total: row.total,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

/** `null` when the order doesn't exist or the token isn't this order's: the two look the same. */
export async function getTrackedOrder(
  orderId: string,
  token: string,
): Promise<TrackedOrderView | null> {
  const row = await db.order.findUnique({ where: { id: orderId }, select: trackedOrderSelect });
  if (row === null || !matchesHash(token, row.trackingTokenHash)) return null;
  return toTrackedOrderView(row);
}

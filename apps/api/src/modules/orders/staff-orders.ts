import { OrderStatus, type Prisma } from '@prisma/client';
import type { ListEnvelope, OrderListQuery, OrderView } from '@restaurant/contracts';
import { db } from '@/lib/db';
import { pageArgs, toList } from '@/lib/pagination';
import type { Staff } from '@/modules/restaurants/staff-auth';
import { canTransition, isFinal } from './order-status';

// Orders as a restaurant's own staff see and manage them (README, Restaurant staff access).
// Every query is filtered by the staff member's restaurant, so another restaurant's order looks
// like it doesn't exist.

const orderSelect = {
  id: true,
  restaurantId: true,
  status: true,
  total: true,
  createdAt: true,
  customer: { select: { name: true, area: true, phone: true } },
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

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

export function toOrderView(row: OrderRow): OrderView {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    status: row.status,
    total: row.total,
    createdAt: row.createdAt.toISOString(),
    customer: {
      name: row.customer.name,
      area: row.customer.area,
      // Staff need the phone to deliver, not to keep: it goes once the order is finished.
      phone: isFinal(row.status) ? null : row.customer.phone,
    },
    items: row.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

export function orderWhere(staff: Staff, query: OrderListQuery): Prisma.OrderWhereInput {
  return {
    restaurantId: staff.restaurantId,
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          createdAt: {
            ...(query.from === undefined ? {} : { gte: query.from }),
            ...(query.to === undefined ? {} : { lte: query.to }),
          },
        }),
  };
}

export function orderOrderBy(query: OrderListQuery): Prisma.OrderOrderByWithRelationInput[] {
  // id breaks ties, so every order has one fixed place and pages don't overlap.
  return [{ [query.sort]: query.order }, { id: query.order }];
}

export async function listOrders(
  staff: Staff,
  query: OrderListQuery,
): Promise<ListEnvelope<OrderView>> {
  const where = orderWhere(staff, query);
  const [total, rows] = await db.$transaction([
    db.order.count({ where }),
    db.order.findMany({
      where,
      select: orderSelect,
      orderBy: orderOrderBy(query),
      ...pageArgs(query),
    }),
  ]);
  return toList(rows, total, query, toOrderView);
}

export async function getOrder(staff: Staff, orderId: string): Promise<OrderView | null> {
  const row = await db.order.findFirst({
    where: { id: orderId, restaurantId: staff.restaurantId },
    select: orderSelect,
  });
  return row === null ? null : toOrderView(row);
}

export type ChangeStatusResult =
  | { ok: true; order: OrderView }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'INVALID_TRANSITION'; from: OrderStatus; to: OrderStatus }
  | { ok: false; reason: 'STATUS_CHANGED' };

/** Moves an order one step (README, Order status). Rule E: never backwards, never skipping. */
export async function changeOrderStatus(
  staff: Staff,
  orderId: string,
  to: OrderStatus,
): Promise<ChangeStatusResult> {
  const current = await db.order.findFirst({
    where: { id: orderId, restaurantId: staff.restaurantId },
    select: { status: true },
  });
  if (current === null) return { ok: false, reason: 'NOT_FOUND' };
  if (!canTransition(current.status, to)) {
    return { ok: false, reason: 'INVALID_TRANSITION', from: current.status, to };
  }

  // Only succeeds if nobody moved the order since it was read, so two staff members acting at
  // once can't both apply a step.
  const updated = await db.order.updateMany({
    where: { id: orderId, restaurantId: staff.restaurantId, status: current.status },
    data: { status: to },
  });
  if (updated.count === 0) return { ok: false, reason: 'STATUS_CHANGED' };

  const row = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: orderSelect });
  return { ok: true, order: toOrderView(row) };
}

/** `DELETE` on an order: cancels it and keeps the row (README, Restaurant staff access). */
export function cancelOrder(staff: Staff, orderId: string): Promise<ChangeStatusResult> {
  return changeOrderStatus(staff, orderId, OrderStatus.CANCELLED);
}

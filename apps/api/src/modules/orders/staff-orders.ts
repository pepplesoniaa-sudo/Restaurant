import type { OrderStatus, Prisma } from '@prisma/client';
import type { Page, StaffOrderListQuery, StaffOrderView } from '@restaurant/contracts';
import { db } from '@/lib/db';
import { pageArgs, toPage } from '@/lib/pagination';
import type { Staff } from '@/modules/restaurants/staff-auth';
import { canTransition, isFinal } from './order-status';

// Orders as a restaurant's own staff see them (README, Restaurant staff access). Every query is
// filtered by the staff member's restaurant, so another restaurant's order looks like it doesn't
// exist.

const staffOrderSelect = {
  id: true,
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

type StaffOrderRow = Prisma.OrderGetPayload<{ select: typeof staffOrderSelect }>;

export function toStaffOrderView(row: StaffOrderRow): StaffOrderView {
  return {
    id: row.id,
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

export async function listStaffOrders(
  staff: Staff,
  query: StaffOrderListQuery,
): Promise<Page<StaffOrderView>> {
  const rows = await db.order.findMany({
    where: {
      restaurantId: staff.restaurantId,
      ...(query.status === undefined ? {} : { status: query.status }),
    },
    select: staffOrderSelect,
    // Newest first; id breaks ties so every order has one fixed place in the list.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(query),
  });
  return toPage(rows, query.limit, toStaffOrderView);
}

export async function getStaffOrder(staff: Staff, orderId: string): Promise<StaffOrderView | null> {
  const row = await db.order.findFirst({
    where: { id: orderId, restaurantId: staff.restaurantId },
    select: staffOrderSelect,
  });
  return row === null ? null : toStaffOrderView(row);
}

export type ChangeStatusResult =
  | { ok: true; order: StaffOrderView }
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

  const row = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: staffOrderSelect,
  });
  return { ok: true, order: toStaffOrderView(row) };
}

import { OrderStatus } from '@prisma/client';

// README, Order status: one step forward at a time, never backwards. Cancelling is allowed until
// the order is out for delivery. DELIVERED and CANCELLED are final.
const NEXT_STATUSES: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

export function isFinal(status: OrderStatus): boolean {
  return NEXT_STATUSES[status].length === 0;
}

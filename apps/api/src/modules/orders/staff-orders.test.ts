import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const order = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
};
vi.mock('@/lib/db', () => ({ db: { order } }));

const { changeOrderStatus, getStaffOrder, listStaffOrders, toStaffOrderView } =
  await import('./staff-orders');

const staff = { restaurantId: 'clrest000000000000000000a' };
const orderId = 'clorder000000000000000000';

function row(status: OrderStatus) {
  return {
    id: orderId,
    status,
    total: 850000,
    createdAt: new Date('2026-09-26T10:00:00.000Z'),
    customer: { name: 'Ada', area: 'Yaba', phone: '+2348031234567' },
    items: [
      {
        menuItemId: 'clitem00000000000000jollof',
        quantity: 2,
        unitPrice: 350000,
        menuItem: { name: 'Jollof rice' },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toStaffOrderView', () => {
  it('shapes the order with the item names', () => {
    expect(toStaffOrderView(row(OrderStatus.PENDING))).toEqual({
      id: orderId,
      status: 'PENDING',
      total: 850000,
      createdAt: '2026-09-26T10:00:00.000Z',
      customer: { name: 'Ada', area: 'Yaba', phone: '+2348031234567' },
      items: [
        {
          menuItemId: 'clitem00000000000000jollof',
          name: 'Jollof rice',
          quantity: 2,
          unitPrice: 350000,
        },
      ],
    });
  });

  it.each([
    [OrderStatus.PENDING, '+2348031234567'],
    [OrderStatus.CONFIRMED, '+2348031234567'],
    [OrderStatus.PREPARING, '+2348031234567'],
    [OrderStatus.OUT_FOR_DELIVERY, '+2348031234567'],
    [OrderStatus.DELIVERED, null],
    [OrderStatus.CANCELLED, null],
  ])('shows the phone for a %s order: %s', (status, phone) => {
    expect(toStaffOrderView(row(status)).customer.phone).toBe(phone);
  });
});

describe('listStaffOrders', () => {
  it("only ever reads the staff member's own restaurant", async () => {
    order.findMany.mockResolvedValue([]);

    await listStaffOrders(staff, { limit: 20 });

    expect(order.findMany.mock.calls[0]?.[0].where).toEqual({ restaurantId: staff.restaurantId });
  });

  it('filters by status when asked', async () => {
    order.findMany.mockResolvedValue([]);

    await listStaffOrders(staff, { limit: 20, status: OrderStatus.PENDING });

    expect(order.findMany.mock.calls[0]?.[0].where).toEqual({
      restaurantId: staff.restaurantId,
      status: OrderStatus.PENDING,
    });
  });

  it('lists newest first', async () => {
    order.findMany.mockResolvedValue([]);

    await listStaffOrders(staff, { limit: 20 });

    expect(order.findMany.mock.calls[0]?.[0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('getStaffOrder', () => {
  it("returns null for another restaurant's order", async () => {
    order.findFirst.mockResolvedValue(null);

    expect(await getStaffOrder(staff, orderId)).toBeNull();
    expect(order.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: orderId,
      restaurantId: staff.restaurantId,
    });
  });
});

describe('changeOrderStatus', () => {
  it("reports NOT_FOUND for another restaurant's order", async () => {
    order.findFirst.mockResolvedValue(null);

    expect(await changeOrderStatus(staff, orderId, OrderStatus.CONFIRMED)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [OrderStatus.PENDING, OrderStatus.PREPARING],
    [OrderStatus.PREPARING, OrderStatus.CONFIRMED],
    [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
    [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  ])('refuses %s → %s without writing (rule E)', async (from, to) => {
    order.findFirst.mockResolvedValue({ status: from });

    expect(await changeOrderStatus(staff, orderId, to)).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
      from,
      to,
    });
    expect(order.updateMany).not.toHaveBeenCalled();
  });

  it('only writes if the order is still in the status it was read in', async () => {
    order.findFirst.mockResolvedValue({ status: OrderStatus.PENDING });
    order.updateMany.mockResolvedValue({ count: 1 });
    order.findUniqueOrThrow.mockResolvedValue(row(OrderStatus.CONFIRMED));

    await changeOrderStatus(staff, orderId, OrderStatus.CONFIRMED);

    expect(order.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: orderId, restaurantId: staff.restaurantId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CONFIRMED },
    });
  });

  it('reports STATUS_CHANGED when someone else moved the order first', async () => {
    order.findFirst.mockResolvedValue({ status: OrderStatus.PENDING });
    order.updateMany.mockResolvedValue({ count: 0 });

    expect(await changeOrderStatus(staff, orderId, OrderStatus.CONFIRMED)).toEqual({
      ok: false,
      reason: 'STATUS_CHANGED',
    });
  });

  it('returns the moved order, with the phone hidden once it is delivered', async () => {
    order.findFirst.mockResolvedValue({ status: OrderStatus.OUT_FOR_DELIVERY });
    order.updateMany.mockResolvedValue({ count: 1 });
    order.findUniqueOrThrow.mockResolvedValue(row(OrderStatus.DELIVERED));

    const result = await changeOrderStatus(staff, orderId, OrderStatus.DELIVERED);

    expect(result.ok && result.order.status).toBe('DELIVERED');
    expect(result.ok && result.order.customer.phone).toBeNull();
  });
});

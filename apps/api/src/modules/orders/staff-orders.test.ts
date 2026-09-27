import { OrderStatus } from '@prisma/client';
import { OrderListQuery } from '@restaurant/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const order = {
  count: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
};
vi.mock('@/lib/db', () => ({
  db: { order, $transaction: (queries: Promise<unknown>[]) => Promise.all(queries) },
}));

const {
  cancelOrder,
  changeOrderStatus,
  getOrder,
  listOrders,
  orderOrderBy,
  orderWhere,
  toOrderView,
} = await import('./staff-orders');

const restaurantId = 'clrest000000000000000000a';
const staff = { restaurantId };
const orderId = 'clorder000000000000000000';
const query = (params: Record<string, string> = {}) => OrderListQuery.parse(params);

function row(status: OrderStatus) {
  return {
    id: orderId,
    restaurantId,
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

describe('toOrderView', () => {
  it('shapes the order with item names', () => {
    expect(toOrderView(row(OrderStatus.PENDING))).toEqual({
      id: orderId,
      restaurantId,
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
    expect(toOrderView(row(status)).customer.phone).toBe(phone);
  });
});

describe('orderWhere', () => {
  it("is always limited to the staff member's restaurant", () => {
    expect(orderWhere(staff, query())).toEqual({ restaurantId });
  });

  it('filters by status and a createdAt range', () => {
    expect(
      orderWhere(
        staff,
        query({ status: 'PENDING', from: '2026-09-01', to: '2026-09-30T23:59:59Z' }),
      ),
    ).toEqual({
      restaurantId,
      status: 'PENDING',
      createdAt: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30T23:59:59Z') },
    });
  });
});

describe('orderOrderBy', () => {
  it('defaults to newest first', () => {
    expect(orderOrderBy(query())).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('sorts by total', () => {
    expect(orderOrderBy(query({ sort: 'total', order: 'asc' }))).toEqual([
      { total: 'asc' },
      { id: 'asc' },
    ]);
  });
});

describe('listOrders', () => {
  it('returns a page with the total count', async () => {
    order.count.mockResolvedValue(41);
    order.findMany.mockResolvedValue([row(OrderStatus.PENDING)]);

    const page = await listOrders(staff, query({ limit: '20', offset: '40' }));

    expect(page.meta).toEqual({ total: 41, limit: 20, offset: 40, hasMore: false });
    expect(order.count.mock.calls[0]?.[0].where).toEqual({ restaurantId });
  });
});

describe('getOrder', () => {
  it("returns null for another restaurant's order", async () => {
    order.findFirst.mockResolvedValue(null);

    expect(await getOrder(staff, orderId)).toBeNull();
    expect(order.findFirst.mock.calls[0]?.[0].where).toEqual({ id: orderId, restaurantId });
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
      where: { id: orderId, restaurantId, status: OrderStatus.PENDING },
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
});

describe('cancelOrder', () => {
  it('moves the order to CANCELLED and keeps it', async () => {
    order.findFirst.mockResolvedValue({ status: OrderStatus.PREPARING });
    order.updateMany.mockResolvedValue({ count: 1 });
    order.findUniqueOrThrow.mockResolvedValue(row(OrderStatus.CANCELLED));

    const result = await cancelOrder(staff, orderId);

    expect(order.updateMany.mock.calls[0]?.[0].data).toEqual({ status: OrderStatus.CANCELLED });
    expect(result.ok && result.order.status).toBe('CANCELLED');
  });

  it('refuses once the order is out for delivery', async () => {
    order.findFirst.mockResolvedValue({ status: OrderStatus.OUT_FOR_DELIVERY });

    expect((await cancelOrder(staff, orderId)).ok).toBe(false);
    expect(order.updateMany).not.toHaveBeenCalled();
  });
});

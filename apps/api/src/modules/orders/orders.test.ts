import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '@/lib/secret-token';

const tx = {
  restaurant: { findUnique: vi.fn() },
  menuItem: { findMany: vi.fn() },
  customer: { upsert: vi.fn() },
  order: { create: vi.fn() },
};
vi.mock('@/lib/db', () => ({
  db: { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
}));

const { placeOrder } = await import('./orders');

const restaurantId = 'clx8k2j9d0000qz8h3v1f7a2b';
const jollofId = 'clx8k2j9d0001qz8h3v1f7a2c';
const customer = { name: 'Ada', phone: '+2348031234567', area: 'Yaba' };
const input = { restaurantId, customer, items: [{ menuItemId: jollofId, quantity: 2 }] };

beforeEach(() => {
  vi.clearAllMocks();
  tx.restaurant.findUnique.mockResolvedValue({ id: restaurantId, deliveryFee: 150000 });
  tx.menuItem.findMany.mockResolvedValue([
    { id: jollofId, restaurantId, price: 350000, available: true },
  ]);
  tx.customer.upsert.mockResolvedValue({ id: 'clcustomer00000000000000a' });
  tx.order.create.mockResolvedValue({
    id: 'clorder000000000000000000',
    restaurantId,
    status: 'PENDING',
    total: 850000,
    createdAt: new Date('2026-09-26T10:00:00.000Z'),
    items: [{ menuItemId: jollofId, quantity: 2, unitPrice: 350000 }],
  });
});

describe('placeOrder', () => {
  it('writes the order with database prices and the server-computed total', async () => {
    await placeOrder(input);

    expect(tx.order.create).toHaveBeenCalledOnce();
    const data = tx.order.create.mock.calls[0]?.[0].data;
    expect(data).toEqual({
      customerId: 'clcustomer00000000000000a',
      restaurantId,
      total: 850000, // 350000 × 2 + 150000 delivery
      items: { create: [{ menuItemId: jollofId, quantity: 2, unitPrice: 350000 }] },
      trackingTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('finds the customer by phone and never overwrites an existing name or area', async () => {
    await placeOrder(input);

    const args = tx.customer.upsert.mock.calls[0]?.[0];
    expect(args.where).toEqual({ phone: '+2348031234567' });
    expect(args.update).toEqual({});
    expect(args.create).toEqual(customer);
  });

  it('returns the order with createdAt as an ISO string', async () => {
    const result = await placeOrder(input);

    expect(result).toEqual({
      ok: true,
      order: {
        id: 'clorder000000000000000000',
        restaurantId,
        status: 'PENDING',
        total: 850000,
        createdAt: '2026-09-26T10:00:00.000Z',
        items: [{ menuItemId: jollofId, quantity: 2, unitPrice: 350000 }],
        trackingToken: expect.stringMatching(/^otk_[A-Za-z0-9_-]{43}$/),
      },
    });
  });

  it('never selects customer data for the response', async () => {
    await placeOrder(input);

    const select = tx.order.create.mock.calls[0]?.[0].select;
    expect(select).not.toHaveProperty('customer');
    expect(select).not.toHaveProperty('customerId');
  });

  it('rejects an unknown restaurant without touching anything else', async () => {
    tx.restaurant.findUnique.mockResolvedValue(null);

    expect(await placeOrder(input)).toEqual({
      ok: false,
      rejection: { reason: 'RESTAURANT_NOT_FOUND' },
    });
    expect(tx.customer.upsert).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('rejects a broken rule before creating a customer or an order', async () => {
    tx.menuItem.findMany.mockResolvedValue([
      { id: jollofId, restaurantId, price: 350000, available: false },
    ]);

    expect(await placeOrder(input)).toEqual({
      ok: false,
      rejection: { reason: 'ITEM_UNAVAILABLE', menuItemId: jollofId },
    });
    expect(tx.customer.upsert).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });
});

describe('placeOrder tracking token', () => {
  it('stores only the hash of the token it hands back', async () => {
    const result = await placeOrder(input);
    if (!result.ok) throw new Error('expected an order');

    const stored = tx.order.create.mock.calls[0]?.[0].data.trackingTokenHash;
    expect(stored).toBe(hashToken(result.order.trackingToken));
    expect(JSON.stringify(tx.order.create.mock.calls)).not.toContain(result.order.trackingToken);
  });

  it('gives every order a different token', async () => {
    const a = await placeOrder(input);
    const b = await placeOrder(input);

    expect(a.ok && b.ok && a.order.trackingToken !== b.order.trackingToken).toBe(true);
  });
});

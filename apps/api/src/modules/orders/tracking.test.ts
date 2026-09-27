import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '@/lib/secret-token';
import { generateTrackingToken } from '@/lib/tracking-token';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ db: { order: { findUnique } } }));

const { getTrackedOrder } = await import('./tracking');

const orderId = 'clorder000000000000000000';
const token = generateTrackingToken();

function row(trackingTokenHash: string | null) {
  return {
    id: orderId,
    restaurantId: 'clrest000000000000000000a',
    status: OrderStatus.PREPARING,
    total: 850000,
    createdAt: new Date('2026-09-26T10:00:00.000Z'),
    trackingTokenHash,
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
  findUnique.mockReset();
});

describe('getTrackedOrder', () => {
  it('returns the order to the holder of its token, with no customer data', async () => {
    findUnique.mockResolvedValue(row(hashToken(token)));

    expect(await getTrackedOrder(orderId, token)).toEqual({
      id: orderId,
      restaurantId: 'clrest000000000000000000a',
      status: 'PREPARING',
      total: 850000,
      createdAt: '2026-09-26T10:00:00.000Z',
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

  it('never even selects the customer or the stored hash for the response', async () => {
    findUnique.mockResolvedValue(row(hashToken(token)));

    const result = await getTrackedOrder(orderId, token);

    expect(findUnique.mock.calls[0]?.[0].select).not.toHaveProperty('customer');
    expect(findUnique.mock.calls[0]?.[0].select).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('trackingTokenHash');
  });

  it("refuses another order's token", async () => {
    findUnique.mockResolvedValue(row(hashToken(generateTrackingToken())));

    expect(await getTrackedOrder(orderId, token)).toBeNull();
  });

  it('refuses every token for an order placed before tracking existed', async () => {
    findUnique.mockResolvedValue(row(null));

    expect(await getTrackedOrder(orderId, token)).toBeNull();
  });

  it('treats a missing order the same as a wrong token', async () => {
    findUnique.mockResolvedValue(null);

    expect(await getTrackedOrder(orderId, token)).toBeNull();
  });
});

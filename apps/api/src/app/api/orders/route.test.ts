import { beforeEach, describe, expect, it, vi } from 'vitest';

const placeOrder = vi.fn();
vi.mock('@/modules/orders/orders', () => ({ placeOrder }));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn() } }));

const { POST } = await import('./route');

const restaurantId = 'clx8k2j9d0000qz8h3v1f7a2b';
const menuItemId = 'clx8k2j9d0001qz8h3v1f7a2c';

const validBody = {
  restaurantId,
  customer: { name: 'Ada', phone: '+2348031234567', area: 'Yaba' },
  items: [{ menuItemId, quantity: 2 }],
};

const placed = {
  id: 'clx8k2j9d0002qz8h3v1f7a2d',
  restaurantId,
  status: 'PENDING',
  total: 850000,
  createdAt: '2026-09-26T10:00:00.000Z',
  items: [{ menuItemId, quantity: 2, unitPrice: 350000 }],
};

function post(body: unknown): Promise<Response> {
  const init = { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) };
  return POST(new Request('http://localhost/api/orders', init));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/orders — validation', () => {
  it.each([
    ['a body that is not JSON', '{not json'],
    ['a missing customer', { ...validBody, customer: undefined }],
    ['no items', { ...validBody, items: [] }],
    ['a restaurant id that is not a cuid', { ...validBody, restaurantId: '57' }],
    [
      'a menu item id that is not a cuid',
      { ...validBody, items: [{ menuItemId: '1', quantity: 1 }] },
    ],
    ['a zero quantity', { ...validBody, items: [{ menuItemId, quantity: 0 }] }],
    ['a fractional quantity', { ...validBody, items: [{ menuItemId, quantity: 1.5 }] }],
    [
      'a local-format phone',
      { ...validBody, customer: { ...validBody.customer, phone: '08031234567' } },
    ],
    ['a short phone', { ...validBody, customer: { ...validBody.customer, phone: '+234803123' } }],
    ['a blank name', { ...validBody, customer: { ...validBody.customer, name: '   ' } }],
  ])('rejects %s with 400 before calling the module', async (_label, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('drops any total or price the client sends (rule A)', async () => {
    placeOrder.mockResolvedValue({ ok: true, order: placed });

    await post({
      ...validBody,
      total: 1,
      items: [{ menuItemId, quantity: 2, unitPrice: 1, price: 1 }],
    });

    expect(placeOrder).toHaveBeenCalledExactlyOnceWith(validBody);
  });
});

describe('POST /api/orders — outcomes', () => {
  it('returns 201 with the order and no customer data', async () => {
    placeOrder.mockResolvedValue({ ok: true, order: placed });

    const res = await post(validBody);
    const text = await res.text();

    expect(res.status).toBe(201);
    expect(JSON.parse(text)).toEqual(placed);
    expect(text).not.toContain('+2348031234567');
    expect(text).not.toContain('Ada');
  });

  it('returns 404 when the restaurant does not exist', async () => {
    placeOrder.mockResolvedValue({ ok: false, rejection: { reason: 'RESTAURANT_NOT_FOUND' } });

    expect((await post(validBody)).status).toBe(404);
  });

  it('returns 422 with the reason when a rule is broken', async () => {
    placeOrder.mockResolvedValue({
      ok: false,
      rejection: { reason: 'ITEM_UNAVAILABLE', menuItemId },
    });

    const res = await post(validBody);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'Order rejected',
      reason: 'ITEM_UNAVAILABLE',
      menuItemId,
    });
  });

  it('returns a generic 500 without leaking the error', async () => {
    placeOrder.mockRejectedValue(new Error('duplicate key +2348031234567'));

    const res = await post(validBody);
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain('+2348031234567');
    expect(text).not.toContain('duplicate key');
  });
});

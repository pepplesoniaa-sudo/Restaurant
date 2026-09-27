import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateStaff = vi.fn();
const listStaffOrders = vi.fn();
const getStaffOrder = vi.fn();
const changeOrderStatus = vi.fn();
const listStaffMenuItems = vi.fn();
const createMenuItem = vi.fn();
const updateMenuItem = vi.fn();
vi.mock('@/modules/restaurants/staff-auth', () => ({ authenticateStaff }));
vi.mock('@/modules/orders/staff-orders', () => ({
  listStaffOrders,
  getStaffOrder,
  changeOrderStatus,
}));
vi.mock('@/modules/menu-items/staff-menu-items', () => ({
  listStaffMenuItems,
  createMenuItem,
  updateMenuItem,
}));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn() } }));

const ordersRoute = await import('./orders/route');
const orderRoute = await import('./orders/[orderId]/route');
const statusRoute = await import('./orders/[orderId]/status/route');
const menuRoute = await import('./menu-items/route');
const menuItemRoute = await import('./menu-items/[menuItemId]/route');

const staff = { restaurantId: 'clrest000000000000000000a' };
const orderId = 'clorder000000000000000000';
const menuItemId = 'clitem00000000000000jollof';
const orderCtx = (id = orderId) => ({ params: Promise.resolve({ orderId: id }) });
const itemCtx = (id = menuItemId) => ({ params: Promise.resolve({ menuItemId: id }) });

function req(path: string, init: { method?: string; body?: unknown } = {}): Request {
  return new Request(`http://localhost/api/staff${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: 'Bearer rsk_whatever' },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateStaff.mockResolvedValue(staff);
});

describe('every staff endpoint', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['GET /orders', () => ordersRoute.GET(req('/orders'))],
    ['GET /orders/{id}', () => orderRoute.GET(req('/orders/x'), orderCtx())],
    [
      'PATCH /orders/{id}/status',
      () =>
        statusRoute.PATCH(
          req('/x', { method: 'PATCH', body: { status: 'CONFIRMED' } }),
          orderCtx(),
        ),
    ],
    ['GET /menu-items', () => menuRoute.GET(req('/menu-items'))],
    [
      'POST /menu-items',
      () =>
        menuRoute.POST(
          req('/menu-items', { method: 'POST', body: { name: 'A', category: 'B', price: 1 } }),
        ),
    ],
    [
      'PATCH /menu-items/{id}',
      () => menuItemRoute.PATCH(req('/x', { method: 'PATCH', body: { price: 1 } }), itemCtx()),
    ],
  ];

  it.each(calls)(
    '%s returns 401 without a valid key and does nothing else',
    async (_label, call) => {
      authenticateStaff.mockResolvedValue(null);

      const res = await call();

      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
      for (const fn of [
        listStaffOrders,
        getStaffOrder,
        changeOrderStatus,
        listStaffMenuItems,
        createMenuItem,
        updateMenuItem,
      ]) {
        expect(fn).not.toHaveBeenCalled();
      }
    },
  );

  it.each(calls)('%s returns a generic 500 without leaking the error', async (_label, call) => {
    authenticateStaff.mockRejectedValue(new Error('db at 10.0.0.5 is down'));

    const res = await call();

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('10.0.0.5');
  });
});

describe('GET /api/staff/orders', () => {
  it('passes the staff member and the query to the module', async () => {
    listStaffOrders.mockResolvedValue({ items: [], nextCursor: null });

    const res = await ordersRoute.GET(req('/orders?status=PENDING&limit=5'));

    expect(res.status).toBe(200);
    expect(listStaffOrders).toHaveBeenCalledExactlyOnceWith(staff, { status: 'PENDING', limit: 5 });
  });

  it.each(['?status=pending', '?status=SHIPPED', '?limit=0', '?cursor=57'])(
    'rejects %s',
    async (query) => {
      const res = await ordersRoute.GET(req(`/orders${query}`));

      expect(res.status).toBe(400);
      expect(listStaffOrders).not.toHaveBeenCalled();
    },
  );
});

describe('GET /api/staff/orders/{orderId}', () => {
  it('returns 404 when the order is not this restaurant’s', async () => {
    getStaffOrder.mockResolvedValue(null);

    expect((await orderRoute.GET(req('/orders/x'), orderCtx())).status).toBe(404);
    expect(getStaffOrder).toHaveBeenCalledExactlyOnceWith(staff, orderId);
  });

  it('rejects an id that is not a cuid', async () => {
    expect((await orderRoute.GET(req('/orders/x'), orderCtx('57'))).status).toBe(400);
  });
});

describe('PATCH /api/staff/orders/{orderId}/status', () => {
  const patch = (body: unknown) =>
    statusRoute.PATCH(req('/x', { method: 'PATCH', body }), orderCtx());

  it.each([{}, { status: 'confirmed' }, { status: 'SHIPPED' }])('rejects %j', async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(changeOrderStatus).not.toHaveBeenCalled();
  });

  it('returns the updated order', async () => {
    changeOrderStatus.mockResolvedValue({ ok: true, order: { id: orderId, status: 'CONFIRMED' } });

    const res = await patch({ status: 'CONFIRMED' });

    expect(res.status).toBe(200);
    expect(changeOrderStatus).toHaveBeenCalledExactlyOnceWith(staff, orderId, 'CONFIRMED');
  });

  it('maps NOT_FOUND to 404', async () => {
    changeOrderStatus.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });

    expect((await patch({ status: 'CONFIRMED' })).status).toBe(404);
  });

  it('maps a forbidden move to 422 and says what was attempted', async () => {
    changeOrderStatus.mockResolvedValue({
      ok: false,
      reason: 'INVALID_TRANSITION',
      from: 'DELIVERED',
      to: 'PENDING',
    });

    const res = await patch({ status: 'PENDING' });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'Status change not allowed',
      reason: 'INVALID_TRANSITION',
      from: 'DELIVERED',
      to: 'PENDING',
    });
  });

  it('maps a concurrent change to 409', async () => {
    changeOrderStatus.mockResolvedValue({ ok: false, reason: 'STATUS_CHANGED' });

    expect((await patch({ status: 'CONFIRMED' })).status).toBe(409);
  });
});

describe('POST /api/staff/menu-items', () => {
  const post = (body: unknown) => menuRoute.POST(req('/menu-items', { method: 'POST', body }));
  const valid = { name: 'Jollof rice', category: 'Mains', price: 350000 };

  it('creates the item for the staff member and returns 201', async () => {
    createMenuItem.mockResolvedValue({ id: menuItemId, ...valid, available: true });

    const res = await post(valid);

    expect(res.status).toBe(201);
    expect(createMenuItem).toHaveBeenCalledExactlyOnceWith(staff, valid);
  });

  it('drops a restaurantId or available flag from the body', async () => {
    createMenuItem.mockResolvedValue({});

    await post({ ...valid, restaurantId: 'clrest000000000000000000b', available: false });

    expect(createMenuItem).toHaveBeenCalledExactlyOnceWith(staff, valid);
  });

  it.each([
    ['a zero price', { ...valid, price: 0 }],
    ['a fractional price', { ...valid, price: 3500.5 }],
    ['a price in naira as a string', { ...valid, price: '3500' }],
    ['a blank name', { ...valid, name: '  ' }],
    ['a missing category', { name: 'A', price: 100 }],
  ])('rejects %s', async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(createMenuItem).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/staff/menu-items/{menuItemId}', () => {
  const patch = (body: unknown, ctx = itemCtx()) =>
    menuItemRoute.PATCH(req('/x', { method: 'PATCH', body }), ctx);

  it('updates and returns the item', async () => {
    updateMenuItem.mockResolvedValue({ id: menuItemId, available: false });

    const res = await patch({ available: false });

    expect(res.status).toBe(200);
    expect(updateMenuItem).toHaveBeenCalledExactlyOnceWith(staff, menuItemId, { available: false });
  });

  it('returns 404 for another restaurant’s item', async () => {
    updateMenuItem.mockResolvedValue(null);

    expect((await patch({ price: 400000 })).status).toBe(404);
  });

  it.each([
    ['an empty change', {}],
    ['a zero price', { price: 0 }],
    ['a non-boolean available', { available: 'no' }],
  ])('rejects %s', async (_label, body) => {
    expect((await patch(body)).status).toBe(400);
    expect(updateMenuItem).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a cuid', async () => {
    expect((await patch({ price: 1 }, itemCtx('57'))).status).toBe(400);
  });
});

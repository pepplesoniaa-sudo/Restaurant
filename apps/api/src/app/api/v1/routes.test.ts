import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRestaurants = vi.fn();
const getRestaurant = vi.fn();
const listMenu = vi.fn();
const getMenuItem = vi.fn();
const createMenuItem = vi.fn();
const updateMenuItem = vi.fn();
const placeOrder = vi.fn();
const listOrders = vi.fn();
const getOrder = vi.fn();
const changeOrderStatus = vi.fn();
const cancelOrder = vi.fn();
const getTrackedOrder = vi.fn();
const authenticateStaff = vi.fn();
const authenticateOptionalStaff = vi.fn();

vi.mock('@/modules/restaurants/restaurants', () => ({ listRestaurants, getRestaurant }));
vi.mock('@/modules/menu-items/menu-items', () => ({
  listMenu,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
}));
vi.mock('@/modules/orders/orders', () => ({ placeOrder }));
vi.mock('@/modules/orders/staff-orders', () => ({
  listOrders,
  getOrder,
  changeOrderStatus,
  cancelOrder,
}));
vi.mock('@/modules/orders/tracking', () => ({ getTrackedOrder }));
vi.mock('@/modules/restaurants/staff-auth', () => ({
  authenticateStaff,
  authenticateOptionalStaff,
}));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn() } }));

const restaurantsRoute = await import('./restaurants/route');
const restaurantRoute = await import('./restaurants/[restaurantId]/route');
const menuRoute = await import('./restaurants/[restaurantId]/menu/route');
const menuItemRoute = await import('./menu-items/[menuItemId]/route');
const ordersRoute = await import('./orders/route');
const orderRoute = await import('./orders/[orderId]/route');
const catchAll = await import('../[...path]/route');
const indexRoute = await import('./route');

const restaurantId = 'clrest000000000000000000a';
const menuItemId = 'clitem00000000000000jollof';
const orderId = 'clorder000000000000000000';
const staff = { restaurantId };
const emptyList = { data: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } };

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
function req(path: string, init: { method?: string; body?: unknown; key?: boolean } = {}) {
  return new Request(`http://localhost/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: init.key === false ? {} : { authorization: 'Bearer rsk_test' },
    ...(init.body === undefined
      ? {}
      : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
  });
}
async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(body).toEqual({ error: { code, message: expect.any(String) } });
  return body.error.message as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateStaff.mockResolvedValue(staff);
  authenticateOptionalStaff.mockResolvedValue({ ok: true, staff: null });
});

describe('GET /api/v1/restaurants', () => {
  const list = (qs = '') => restaurantsRoute.GET(req(`/restaurants${qs}`, { key: false }));

  it('passes defaults to the module and returns its list envelope', async () => {
    listRestaurants.mockResolvedValue(emptyList);

    const res = await list();

    expect(await res.json()).toEqual(emptyList);
    expect(listRestaurants).toHaveBeenCalledExactlyOnceWith({
      limit: 20,
      offset: 0,
      sort: 'name',
      order: 'asc',
    });
  });

  it('parses filters, sorting and paging', async () => {
    listRestaurants.mockResolvedValue(emptyList);

    await list(
      '?area=Yaba&cuisine=Grills&minRating=4.5&maxDeliveryFee=100000&sort=rating&order=desc&limit=100&offset=40',
    );

    expect(listRestaurants).toHaveBeenCalledExactlyOnceWith({
      area: 'Yaba',
      cuisine: 'Grills',
      minRating: 4.5,
      maxDeliveryFee: 100000,
      sort: 'rating',
      order: 'desc',
      limit: 100,
      offset: 40,
    });
  });

  it.each([
    ['limit', '?limit=0'],
    ['limit', '?limit=-5'],
    ['limit', '?limit='],
    ['limit', '?limit=2.5'],
    ['offset', '?offset=-1'],
    ['sort', '?sort=id'],
    ['order', '?order=up'],
    ['minRating', '?minRating=6'],
    ['minRating', '?minRating=high'],
    ['maxDeliveryFee', '?maxDeliveryFee=15.5'],
    ['area', '?area='],
  ])('rejects a bad %s (%s) with 400 naming the field', async (field, qs) => {
    const message = await expectError(await list(qs), 400, 'VALIDATION_ERROR');

    expect(message.startsWith(`${field}:`)).toBe(true);
    expect(listRestaurants).not.toHaveBeenCalled();
  });

  it.each(['101', '5000', '99999999999999999999'])(
    'clamps limit=%s to the maximum of 100 instead of honouring it (README, Lists)',
    async (limit) => {
      listRestaurants.mockResolvedValue(emptyList);

      const res = await list(`?limit=${limit}`);

      expect(res.status).toBe(200);
      expect(listRestaurants.mock.calls[0]?.[0].limit).toBe(100);
    },
  );

  it('says what a negative offset should be', async () => {
    expect(await expectError(await list('?offset=-5'), 400, 'VALIDATION_ERROR')).toBe(
      'offset: Must be a whole number, 0 or more',
    );
  });

  it('names the allowed fields for an unknown sort', async () => {
    const message = await expectError(await list('?sort=popularity'), 400, 'VALIDATION_ERROR');

    expect(message).toContain('name');
    expect(message).toContain('deliveryFee');
  });

  it('returns a generic 500 without leaking the error', async () => {
    listRestaurants.mockRejectedValue(new Error('db at 10.0.0.5 is down'));

    const message = await expectError(await list(), 500, 'INTERNAL_ERROR');

    expect(message).not.toContain('10.0.0.5');
  });

  it('answers an unsupported method with 405 in the error envelope', async () => {
    await expectError(restaurantsRoute.POST(), 405, 'METHOD_NOT_ALLOWED');
  });
});

describe('GET /api/v1/restaurants/{id}', () => {
  const get = (id: string) =>
    restaurantRoute.GET(req(`/restaurants/${id}`), params({ restaurantId: id }));

  it('returns the restaurant in the data envelope', async () => {
    getRestaurant.mockResolvedValue({ id: restaurantId });

    expect(await (await get(restaurantId)).json()).toEqual({ data: { id: restaurantId } });
  });

  it('returns 404 with a clear message', async () => {
    getRestaurant.mockResolvedValue(null);

    expect(await expectError(await get(restaurantId), 404, 'NOT_FOUND')).toBe(
      'Restaurant not found',
    );
  });

  it('rejects an id that is not a cuid', async () => {
    await expectError(await get('57'), 400, 'VALIDATION_ERROR');
    expect(getRestaurant).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/restaurants/{id}/menu', () => {
  const get = (qs = '', key = false) =>
    menuRoute.GET(req(`/restaurants/${restaurantId}/menu${qs}`, { key }), params({ restaurantId }));

  it('lists the menu for an ordinary caller', async () => {
    listMenu.mockResolvedValue(emptyList);

    const res = await get('?category=Mains&minPrice=1000&maxPrice=5000&sort=price&order=desc');

    expect(res.status).toBe(200);
    expect(listMenu).toHaveBeenCalledExactlyOnceWith(
      restaurantId,
      {
        category: 'Mains',
        minPrice: 1000,
        maxPrice: 5000,
        sort: 'price',
        order: 'desc',
        limit: 20,
        offset: 0,
      },
      null,
    );
  });

  it('passes the staff member through so they see hidden items', async () => {
    authenticateOptionalStaff.mockResolvedValue({ ok: true, staff });
    listMenu.mockResolvedValue(emptyList);

    await get('?available=false', true);

    expect(listMenu.mock.calls[0]?.[1].available).toBe(false);
    expect(listMenu.mock.calls[0]?.[2]).toEqual(staff);
  });

  it('refuses a bad key instead of treating it as no key', async () => {
    authenticateOptionalStaff.mockResolvedValue({ ok: false });

    await expectError(await get('', true), 401, 'UNAUTHORIZED');
    expect(listMenu).not.toHaveBeenCalled();
  });

  it.each([
    ['minPrice', '?minPrice=5000&maxPrice=1000'],
    ['available', '?available=maybe'],
    ['sort', '?sort=rating'],
  ])('rejects a bad %s', async (field, qs) => {
    expect(
      (await expectError(await get(qs), 400, 'VALIDATION_ERROR')).startsWith(`${field}:`),
    ).toBe(true);
  });

  it('returns 404 for an unknown restaurant', async () => {
    listMenu.mockResolvedValue(null);

    await expectError(await get(), 404, 'NOT_FOUND');
  });
});

describe('POST /api/v1/restaurants/{id}/menu', () => {
  const valid = { name: 'Jollof rice', category: 'Mains', price: 350000 };
  const post = (body: unknown) =>
    menuRoute.POST(
      req(`/restaurants/${restaurantId}/menu`, { method: 'POST', body }),
      params({ restaurantId }),
    );

  it('creates the item and returns 201 with the data envelope', async () => {
    createMenuItem.mockResolvedValue({ ok: true, item: { id: menuItemId } });

    const res = await post(valid);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: menuItemId } });
    expect(createMenuItem).toHaveBeenCalledExactlyOnceWith(staff, restaurantId, valid);
  });

  it('needs a staff key', async () => {
    authenticateStaff.mockResolvedValue(null);

    await expectError(await post(valid), 401, 'UNAUTHORIZED');
    expect(createMenuItem).not.toHaveBeenCalled();
  });

  it("returns 403 for another restaurant's menu", async () => {
    createMenuItem.mockResolvedValue({ ok: false, reason: 'FORBIDDEN' });

    await expectError(await post(valid), 403, 'FORBIDDEN');
  });

  it.each([
    ['price', { ...valid, price: 0 }],
    ['price', { ...valid, price: '3500' }],
    ['name', { ...valid, name: ' ' }],
  ])('rejects a bad %s with 422 naming it', async (field, body) => {
    expect(
      (await expectError(await post(body), 422, 'VALIDATION_ERROR')).startsWith(`${field}:`),
    ).toBe(true);
  });

  it.each([
    ['name', { category: valid.category, price: valid.price }],
    ['category', { name: valid.name, price: valid.price }],
    ['price', { name: valid.name, category: valid.category }],
  ])('rejects a missing %s with 422 saying it is required', async (field, body) => {
    expect(await expectError(await post(body), 422, 'VALIDATION_ERROR')).toBe(`${field}: Required`);
    expect(createMenuItem).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON with 400', async () => {
    expect(await expectError(await post('not json'), 400, 'VALIDATION_ERROR')).toBe(
      'body: Must be valid JSON',
    );
  });
});

describe('/api/v1/menu-items/{id}', () => {
  const ctx = params({ menuItemId });

  it('GET returns the item, or 404 when it is hidden from this caller', async () => {
    getMenuItem.mockResolvedValueOnce({ id: menuItemId }).mockResolvedValueOnce(null);

    expect(await (await menuItemRoute.GET(req('/x', { key: false }), ctx)).json()).toEqual({
      data: { id: menuItemId },
    });
    await expectError(await menuItemRoute.GET(req('/x', { key: false }), ctx), 404, 'NOT_FOUND');
  });

  it('PATCH updates the item for its own staff', async () => {
    updateMenuItem.mockResolvedValue({ id: menuItemId, available: false });

    const res = await menuItemRoute.PATCH(
      req('/x', { method: 'PATCH', body: { available: false } }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(updateMenuItem).toHaveBeenCalledExactlyOnceWith(staff, menuItemId, { available: false });
  });

  it('PATCH rejects an empty change', async () => {
    await expectError(
      await menuItemRoute.PATCH(req('/x', { method: 'PATCH', body: {} }), ctx),
      422,
      'VALIDATION_ERROR',
    );
  });

  it("PATCH returns 404 for another restaurant's item", async () => {
    updateMenuItem.mockResolvedValue(null);

    await expectError(
      await menuItemRoute.PATCH(req('/x', { method: 'PATCH', body: { price: 1 } }), ctx),
      404,
      'NOT_FOUND',
    );
  });

  it('DELETE is not offered: items are hidden, never deleted', async () => {
    await expectError(menuItemRoute.DELETE(), 405, 'METHOD_NOT_ALLOWED');
  });
});

describe('POST /api/v1/orders', () => {
  const valid = {
    restaurantId,
    customer: { name: 'Ada', phone: '+2348031234567', area: 'Yaba' },
    items: [{ menuItemId, quantity: 2 }],
  };
  const post = (body: unknown) =>
    ordersRoute.POST(req('/orders', { method: 'POST', body, key: false }));

  it('places the order and returns 201 in the data envelope, ignoring client money', async () => {
    placeOrder.mockResolvedValue({ ok: true, order: { id: orderId } });

    const res = await post({
      ...valid,
      total: 1,
      items: [{ menuItemId, quantity: 2, unitPrice: 1 }],
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: orderId } });
    expect(placeOrder).toHaveBeenCalledExactlyOnceWith(valid);
  });

  it('returns 422 with the rule as the code', async () => {
    placeOrder.mockResolvedValue({
      ok: false,
      rejection: { reason: 'ITEM_UNAVAILABLE', menuItemId },
    });

    const message = await expectError(await post(valid), 422, 'ITEM_UNAVAILABLE');

    expect(message).toContain(menuItemId);
  });

  it('returns 404 for an unknown restaurant', async () => {
    placeOrder.mockResolvedValue({ ok: false, rejection: { reason: 'RESTAURANT_NOT_FOUND' } });

    await expectError(await post(valid), 404, 'NOT_FOUND');
  });

  it.each([
    ['restaurantId', { customer: valid.customer, items: valid.items }],
    ['customer.name', { ...valid, customer: { phone: valid.customer.phone, area: 'Yaba' } }],
    ['items', { restaurantId, customer: valid.customer }],
    ['items.0.quantity', { ...valid, items: [{ menuItemId }] }],
    ['restaurantId', { ...valid, restaurantId: '42' }],
    ['items.0.menuItemId', { ...valid, items: [{ menuItemId: '../etc', quantity: 1 }] }],
  ])('rejects a missing or malformed %s with 422 naming the field', async (field, body) => {
    // A missing field reads "Required"; a malformed one says what is wrong with it.
    const message = await expectError(await post(body), 422, 'VALIDATION_ERROR');

    expect(message.startsWith(`${field}:`)).toBe(true);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('rejects a local-format phone, naming the field', async () => {
    const message = await expectError(
      await post({ ...valid, customer: { ...valid.customer, phone: '08031234567' } }),
      422,
      'VALIDATION_ERROR',
    );

    expect(message.startsWith('customer.phone:')).toBe(true);
  });
});

describe('GET /api/v1/orders', () => {
  it('needs a staff key', async () => {
    authenticateStaff.mockResolvedValue(null);

    await expectError(await ordersRoute.GET(req('/orders', { key: false })), 401, 'UNAUTHORIZED');
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('lists the staff member’s orders with filters, newest first by default', async () => {
    listOrders.mockResolvedValue(emptyList);

    await ordersRoute.GET(req('/orders?status=PENDING&from=2026-09-01&sort=total'));

    expect(listOrders).toHaveBeenCalledExactlyOnceWith(staff, {
      status: 'PENDING',
      from: new Date('2026-09-01'),
      sort: 'total',
      order: 'desc',
      limit: 20,
      offset: 0,
    });
  });

  it.each([
    ['status', '?status=pending'],
    ['from', '?from=yesterday'],
    ['from', '?from=2026-09-30&to=2026-09-01'],
  ])('rejects a bad %s', async (field, qs) => {
    const message = await expectError(
      await ordersRoute.GET(req(`/orders${qs}`)),
      400,
      'VALIDATION_ERROR',
    );

    expect(message.startsWith(`${field}:`)).toBe(true);
  });
});

describe('/api/v1/orders/{id}', () => {
  const ctx = params({ orderId });
  const patch = (body: unknown) => orderRoute.PATCH(req('/x', { method: 'PATCH', body }), ctx);

  it('every method needs a staff key', async () => {
    authenticateStaff.mockResolvedValue(null);

    await expectError(await orderRoute.GET(req('/x', { key: false }), ctx), 401, 'UNAUTHORIZED');
    await expectError(await patch({ status: 'CONFIRMED' }), 401, 'UNAUTHORIZED');
    await expectError(
      await orderRoute.DELETE(req('/x', { method: 'DELETE' }), ctx),
      401,
      'UNAUTHORIZED',
    );
    expect(changeOrderStatus).not.toHaveBeenCalled();
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('GET returns 404 for another restaurant’s order', async () => {
    getOrder.mockResolvedValue(null);

    expect(await expectError(await orderRoute.GET(req('/x'), ctx), 404, 'NOT_FOUND')).toBe(
      'Order not found',
    );
  });

  it('PATCH moves the status and returns the order', async () => {
    changeOrderStatus.mockResolvedValue({ ok: true, order: { id: orderId, status: 'CONFIRMED' } });

    const res = await patch({ status: 'CONFIRMED' });

    expect(await res.json()).toEqual({ data: { id: orderId, status: 'CONFIRMED' } });
    expect(changeOrderStatus).toHaveBeenCalledExactlyOnceWith(staff, orderId, 'CONFIRMED');
  });

  it.each([
    ['anything but status', { status: 'CONFIRMED', total: 1 }],
    ['no status', {}],
    ['an unknown status', { status: 'SHIPPED' }],
  ])('PATCH rejects %s with 422', async (_label, body) => {
    await expectError(await patch(body), 422, 'VALIDATION_ERROR');
    expect(changeOrderStatus).not.toHaveBeenCalled();
  });

  it('PATCH returns 409 for a move the rules forbid', async () => {
    changeOrderStatus.mockResolvedValue({
      ok: false,
      reason: 'INVALID_TRANSITION',
      from: 'PENDING',
      to: 'DELIVERED',
    });

    const message = await expectError(
      await patch({ status: 'DELIVERED' }),
      409,
      'INVALID_TRANSITION',
    );

    expect(message).toBe("An order can't go from PENDING to DELIVERED");
  });

  it('PATCH returns 409 when someone else changed the order first', async () => {
    changeOrderStatus.mockResolvedValue({ ok: false, reason: 'STATUS_CHANGED' });

    await expectError(await patch({ status: 'CONFIRMED' }), 409, 'STATUS_CHANGED');
  });

  it('DELETE cancels the order and returns it', async () => {
    cancelOrder.mockResolvedValue({ ok: true, order: { id: orderId, status: 'CANCELLED' } });

    const res = await orderRoute.DELETE(req('/x', { method: 'DELETE' }), ctx);

    expect(await res.json()).toEqual({ data: { id: orderId, status: 'CANCELLED' } });
    expect(cancelOrder).toHaveBeenCalledExactlyOnceWith(staff, orderId);
  });

  it('DELETE returns 409 once the order is out for delivery', async () => {
    cancelOrder.mockResolvedValue({
      ok: false,
      reason: 'INVALID_TRANSITION',
      from: 'OUT_FOR_DELIVERY',
      to: 'CANCELLED',
    });

    await expectError(
      await orderRoute.DELETE(req('/x', { method: 'DELETE' }), ctx),
      409,
      'INVALID_TRANSITION',
    );
  });
});

describe('GET /api/v1 (index)', () => {
  it('answers with what the API is and its endpoints, instead of 404', async () => {
    const res = indexRoute.GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.version).toBe('v1');
    expect(body.data.endpoints.every((e: { path: string }) => e.path.startsWith('/api/v1/'))).toBe(
      true,
    );
  });

  it('lists the same 11 endpoints the README documents', async () => {
    const { readFile } = await import('node:fs/promises');
    const readme = await readFile(new URL('../../../../../../README.md', import.meta.url), 'utf8');
    const documented = [...readme.matchAll(/^\| \[`(GET|POST|PATCH|DELETE) (\/[^`]+)`\]/gm)].map(
      ([, method, path]) => `${method} /api/v1${path}`,
    );
    const listed = (await indexRoute.GET().json()).data.endpoints.map(
      (e: { method: string; path: string }) => `${e.method} ${e.path}`,
    );

    expect(documented).toHaveLength(11);
    expect(listed).toEqual(documented);
  });

  it('refuses other methods with 405', async () => {
    await expectError(indexRoute.POST(), 405, 'METHOD_NOT_ALLOWED');
  });
});

describe('unknown paths', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    '%s answers 404 in the error envelope',
    async (method) => {
      const message = await expectError(catchAll[method](), 404, 'NOT_FOUND');

      expect(message).toContain('/api/v1/');
    },
  );
});

describe('malformed identifiers', () => {
  // Each is rejected before any module (and so the database) is reached: never a 500.
  const bad = ['57', 'abc', "clx'; DROP TABLE", '%00', 'x'.repeat(500)];

  it.each(bad)('every id route answers %j with 400 naming the id', async (id) => {
    const token = 'otk_' + 'A'.repeat(43);
    const withToken = new Request('http://localhost/api/v1/orders/x', {
      headers: { authorization: `Bearer ${token}` },
    });
    const responses: [string, Response][] = [
      ['restaurantId', await restaurantRoute.GET(req('/x'), params({ restaurantId: id }))],
      [
        'restaurantId',
        await menuRoute.GET(req('/x', { key: false }), params({ restaurantId: id })),
      ],
      [
        'restaurantId',
        await menuRoute.POST(
          req('/x', { method: 'POST', body: { name: 'Suya', category: 'Grills', price: 100 } }),
          params({ restaurantId: id }),
        ),
      ],
      [
        'menuItemId',
        await menuItemRoute.GET(req('/x', { key: false }), params({ menuItemId: id })),
      ],
      [
        'menuItemId',
        await menuItemRoute.PATCH(
          req('/x', { method: 'PATCH', body: { price: 1 } }),
          params({ menuItemId: id }),
        ),
      ],
      ['orderId', await orderRoute.GET(req('/x'), params({ orderId: id }))],
      ['orderId', await orderRoute.GET(withToken, params({ orderId: id }))],
      [
        'orderId',
        await orderRoute.PATCH(
          req('/x', { method: 'PATCH', body: { status: 'CONFIRMED' } }),
          params({ orderId: id }),
        ),
      ],
      [
        'orderId',
        await orderRoute.DELETE(req('/x', { method: 'DELETE' }), params({ orderId: id })),
      ],
    ];

    for (const [field, res] of responses) {
      expect((await expectError(res, 400, 'VALIDATION_ERROR')).startsWith(`${field}:`)).toBe(true);
    }
    for (const moduleFn of [
      getRestaurant,
      listMenu,
      createMenuItem,
      getMenuItem,
      updateMenuItem,
      getOrder,
      getTrackedOrder,
      changeOrderStatus,
      cancelOrder,
    ]) {
      expect(moduleFn).not.toHaveBeenCalled();
    }
  });
});

describe('status change messages', () => {
  it('says an order is final instead of naming an impossible move', async () => {
    cancelOrder.mockResolvedValue({
      ok: false,
      reason: 'INVALID_TRANSITION',
      from: 'CANCELLED',
      to: 'CANCELLED',
    });

    const res = await orderRoute.DELETE(
      new Request('http://localhost/api/v1/orders/x', {
        method: 'DELETE',
        headers: { authorization: 'Bearer rsk_test' },
      }),
      params({ orderId }),
    );

    expect((await res.json()).error.message).toBe(
      "The order is already CANCELLED and can't change",
    );
  });
});

describe('GET /api/v1/orders/{id} with a tracking token', () => {
  const token = 'otk_' + 'A'.repeat(43);
  const ctx = params({ orderId });
  const withToken = (method = 'GET') =>
    new Request('http://localhost/api/v1/orders/x', {
      method,
      headers: { authorization: `Bearer ${token}` },
      ...(method === 'PATCH' ? { body: JSON.stringify({ status: 'CANCELLED' }) } : {}),
    });

  it('returns the order to its customer without asking for a staff key', async () => {
    getTrackedOrder.mockResolvedValue({ id: orderId, status: 'PREPARING' });

    const res = await orderRoute.GET(withToken(), ctx);

    expect(await res.json()).toEqual({ data: { id: orderId, status: 'PREPARING' } });
    expect(getTrackedOrder).toHaveBeenCalledExactlyOnceWith(orderId, token);
    expect(authenticateStaff).not.toHaveBeenCalled();
    expect(getOrder).not.toHaveBeenCalled();
  });

  it('answers a wrong token exactly like a missing order', async () => {
    getTrackedOrder.mockResolvedValue(null);

    expect(await expectError(await orderRoute.GET(withToken(), ctx), 404, 'NOT_FOUND')).toBe(
      'Order not found',
    );
  });

  it('cannot change or cancel the order', async () => {
    // A tracking token is not a staff key, so staff authentication fails.
    authenticateStaff.mockResolvedValue(null);

    await expectError(await orderRoute.PATCH(withToken('PATCH'), ctx), 401, 'UNAUTHORIZED');
    await expectError(await orderRoute.DELETE(withToken('DELETE'), ctx), 401, 'UNAUTHORIZED');
    expect(changeOrderStatus).not.toHaveBeenCalled();
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('cannot list orders', async () => {
    authenticateStaff.mockResolvedValue(null);

    await expectError(await ordersRoute.GET(withToken()), 401, 'UNAUTHORIZED');
    expect(listOrders).not.toHaveBeenCalled();
  });
});

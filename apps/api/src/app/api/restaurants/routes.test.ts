import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRestaurants = vi.fn();
const getRestaurant = vi.fn();
const listAvailableMenuItems = vi.fn();
vi.mock('@/modules/restaurants/restaurants', () => ({ listRestaurants, getRestaurant }));
vi.mock('@/modules/menu-items/menu-items', () => ({ listAvailableMenuItems }));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn() } }));

const listRoute = await import('./route');
const oneRoute = await import('./[restaurantId]/route');
const menuRoute = await import('./[restaurantId]/menu-items/route');

const restaurantId = 'clx8k2j9d0000qz8h3v1f7a2b';
const req = new Request('http://localhost/api/restaurants');
const ctx = (id: string) => ({ params: Promise.resolve({ restaurantId: id }) });

const restaurant = {
  id: restaurantId,
  name: 'Mama Put',
  area: 'Yaba',
  cuisine: 'Nigerian',
  rating: 4.3,
  deliveryFee: 150000,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/restaurants', () => {
  const list = (query = '') =>
    listRoute.GET(new Request(`http://localhost/api/restaurants${query}`));

  it('asks for the default page size when no limit is given', async () => {
    listRestaurants.mockResolvedValue({ items: [restaurant], nextCursor: null });

    const res = await list();

    expect(listRestaurants).toHaveBeenCalledExactlyOnceWith({ limit: 20 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [restaurant], nextCursor: null });
  });

  it('passes the limit and cursor through', async () => {
    listRestaurants.mockResolvedValue({ items: [], nextCursor: null });

    await list(`?limit=100&cursor=${restaurantId}`);

    expect(listRestaurants).toHaveBeenCalledExactlyOnceWith({ limit: 100, cursor: restaurantId });
  });

  it.each([
    ['a limit of 0', '?limit=0'],
    ['a limit above 100', '?limit=101'],
    ['a fractional limit', '?limit=2.5'],
    ['a non-numeric limit', '?limit=all'],
    ['an empty limit', '?limit='],
    ['a cursor that is not a cuid', '?cursor=57'],
  ])('rejects %s with 400 before calling the module', async (_label, query) => {
    const res = await list(query);

    expect(res.status).toBe(400);
    expect(listRestaurants).not.toHaveBeenCalled();
  });

  it('returns a generic 500 without leaking the error', async () => {
    listRestaurants.mockRejectedValue(new Error('connection refused at 10.0.0.5'));

    const res = await list();

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.5');
  });
});

describe('GET /api/restaurants/{restaurantId}', () => {
  it('rejects an id that is not a cuid before calling the module', async () => {
    const res = await oneRoute.GET(req, ctx('57'));

    expect(res.status).toBe(400);
    expect(getRestaurant).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown restaurant', async () => {
    getRestaurant.mockResolvedValue(null);

    const res = await oneRoute.GET(req, ctx(restaurantId));

    expect(res.status).toBe(404);
  });

  it('calls the module once and returns the restaurant', async () => {
    getRestaurant.mockResolvedValue(restaurant);

    const res = await oneRoute.GET(req, ctx(restaurantId));

    expect(getRestaurant).toHaveBeenCalledExactlyOnceWith(restaurantId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(restaurant);
  });

  it('returns a generic 500 without leaking the error', async () => {
    getRestaurant.mockRejectedValue(new Error('secret detail'));

    const res = await oneRoute.GET(req, ctx(restaurantId));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret detail');
  });
});

describe('GET /api/restaurants/{restaurantId}/menu-items', () => {
  it('rejects an id that is not a cuid before calling the module', async () => {
    const res = await menuRoute.GET(req, ctx('1 OR 1=1'));

    expect(res.status).toBe(400);
    expect(listAvailableMenuItems).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown restaurant', async () => {
    listAvailableMenuItems.mockResolvedValue(null);

    const res = await menuRoute.GET(req, ctx(restaurantId));

    expect(res.status).toBe(404);
  });

  it('returns an empty list, not 404, when nothing is available', async () => {
    listAvailableMenuItems.mockResolvedValue([]);

    const res = await menuRoute.GET(req, ctx(restaurantId));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns a generic 500 without leaking the error', async () => {
    listAvailableMenuItems.mockRejectedValue(new Error('secret detail'));

    const res = await menuRoute.GET(req, ctx(restaurantId));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret detail');
  });
});

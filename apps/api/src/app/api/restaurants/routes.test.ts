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
  it('returns the list from the module', async () => {
    listRestaurants.mockResolvedValue([restaurant]);

    const res = await listRoute.GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([restaurant]);
  });

  it('returns a generic 500 without leaking the error', async () => {
    listRestaurants.mockRejectedValue(new Error('connection refused at 10.0.0.5'));

    const res = await listRoute.GET();

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

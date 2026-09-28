import { MenuItemCreateInput, RestaurantListQuery } from '@restaurant/contracts';
import { describe, expect, it } from 'vitest';
import {
  conflict,
  created,
  forbidden,
  invalid,
  methodNotAllowed,
  notFound,
  ok,
  okList,
  queryOf,
  readBody,
  serverError,
  unauthorized,
  unprocessable,
} from './http';

describe('success envelopes', () => {
  it('wraps one resource in data', async () => {
    const res = ok({ id: 'x' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: 'x' } });
  });

  it('wraps a created resource in data with 201', async () => {
    const res = created({ id: 'x' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: 'x' } });
  });

  it('passes a list envelope through unchanged', async () => {
    const list = { data: [1], meta: { total: 1, limit: 20, offset: 0, hasMore: false } };
    expect(await okList(list).json()).toEqual(list);
  });
});

describe('error envelopes', () => {
  it.each([
    [unauthorized(), 401, 'UNAUTHORIZED'],
    [forbidden('No'), 403, 'FORBIDDEN'],
    [notFound('Restaurant not found'), 404, 'NOT_FOUND'],
    [methodNotAllowed(), 405, 'METHOD_NOT_ALLOWED'],
    [conflict('INVALID_TRANSITION', 'No'), 409, 'INVALID_TRANSITION'],
    [unprocessable('ITEM_UNAVAILABLE', 'No'), 422, 'ITEM_UNAVAILABLE'],
    [serverError(), 500, 'INTERNAL_ERROR'],
  ] as const)('%#: status %i uses { error: { code: %s, message } }', async (res, status, code) => {
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['error']);
    expect(Object.keys(body.error)).toEqual(['code', 'message']);
    expect(body.error.code).toBe(code);
    expect(typeof body.error.message).toBe('string');
  });

  it('asks for a bearer token on 401', () => {
    expect(unauthorized().headers.get('www-authenticate')).toBe('Bearer');
  });

  it('names the query parameter that failed validation, with 400', async () => {
    const parsed = RestaurantListQuery.safeParse({ offset: '-1' });
    if (parsed.success) throw new Error('expected a failure');

    const res = invalid(parsed.error);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'offset: Must be a whole number, 0 or more',
    });
  });
});

describe('readBody', () => {
  const post = (body: string) => new Request('http://x/api', { method: 'POST', body });

  it('returns the parsed body when it follows the schema', async () => {
    expect(
      await readBody(post('{"name":"Suya","category":"Grills","price":100}'), MenuItemCreateInput),
    ).toEqual({
      ok: true,
      data: { name: 'Suya', category: 'Grills', price: 100 },
    });
  });

  it('answers a missing field with 422, naming it as required', async () => {
    const result = await readBody(post('{"name":"Suya","price":100}'), MenuItemCreateInput);
    if (result.ok) throw new Error('expected a failure');

    expect(result.response.status).toBe(422);
    expect((await result.response.json()).error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'category: Required',
    });
  });

  it.each(['{not json', '', 'undefined'])(
    'answers %j, which is not JSON, with 400',
    async (raw) => {
      const result = await readBody(post(raw), MenuItemCreateInput);
      if (result.ok) throw new Error('expected a failure');

      expect(result.response.status).toBe(400);
      expect((await result.response.json()).error.message).toBe('body: Must be valid JSON');
    },
  );

  it('answers JSON that is not an object with 422', async () => {
    const result = await readBody(post('[1,2]'), MenuItemCreateInput);
    if (result.ok) throw new Error('expected a failure');

    expect(result.response.status).toBe(422);
  });
});

describe('queryOf', () => {
  it('reads the query string into an object', () => {
    expect(queryOf(new Request('http://x/api?limit=5&sort=price'))).toEqual({
      limit: '5',
      sort: 'price',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { corsConfig } from '@/config/cors';
import { corsHeaders, preflightResponse, withCors } from './cors';

describe('corsHeaders', () => {
  it('lets any origin read responses and exposes Retry-After', () => {
    expect(corsHeaders(corsConfig)).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Retry-After',
    });
  });

  it('never allows credentials: the API uses no cookies', () => {
    expect(Object.keys(corsHeaders(corsConfig))).not.toContain('Access-Control-Allow-Credentials');
  });
});

describe('preflightResponse', () => {
  it('answers 204 with the allowed methods and headers', async () => {
    const res = preflightResponse(corsConfig);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, PATCH, DELETE, OPTIONS',
    );
    expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    expect(res.headers.get('access-control-max-age')).toBe('600');
  });
});

describe('withCors', () => {
  it('adds the headers to a response the proxy made itself, keeping its own', () => {
    const refused = new Response('{}', { status: 429, headers: { 'Retry-After': '30' } });

    const res = withCors(refused, corsConfig);

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-expose-headers')).toBe('Retry-After');
  });
});

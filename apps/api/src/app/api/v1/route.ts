import { ok } from '@/lib/http';

// The API's front door (README, API index): what this is and where to go next, so opening the
// base URL answers instead of returning 404. Static: no database, no personal data.

const index = {
  name: 'Restaurant — Food Market API',
  version: 'v1',
  documentation: 'See the README, section "Using the API"',
  endpoints: [
    { method: 'GET', path: '/api/v1/restaurants', access: 'anyone' },
    { method: 'GET', path: '/api/v1/restaurants/{id}', access: 'anyone' },
    { method: 'GET', path: '/api/v1/restaurants/{id}/menu', access: 'anyone' },
    { method: 'POST', path: '/api/v1/restaurants/{id}/menu', access: 'staff' },
    { method: 'GET', path: '/api/v1/menu-items/{id}', access: 'anyone' },
    { method: 'PATCH', path: '/api/v1/menu-items/{id}', access: 'staff' },
    { method: 'POST', path: '/api/v1/orders', access: 'anyone' },
    { method: 'GET', path: '/api/v1/orders', access: 'staff' },
    { method: 'GET', path: '/api/v1/orders/{id}', access: 'staff or tracking token' },
    { method: 'PATCH', path: '/api/v1/orders/{id}', access: 'staff' },
    { method: 'DELETE', path: '/api/v1/orders/{id}', access: 'staff' },
  ],
} as const;

export function GET(): Response {
  return ok(index);
}

export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
} from '@/lib/http';

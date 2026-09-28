// Cross-origin access for browser clients (README, Calling from a browser). Change these here;
// no handler contains them.
//
// Any origin is allowed because the API uses no cookies: credentials only travel in the
// Authorization header, which a page sends only if it holds the key or token itself.

export const corsConfig = {
  allowOrigin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  /** Response headers a page may read; the rest stay hidden by the browser. */
  exposeHeaders: ['Retry-After'],
  /** How long a browser may reuse a preflight answer, in seconds. */
  maxAgeSeconds: 600,
} as const;

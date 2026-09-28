// Rate limiting (README, Rate limiting). Change the numbers here; no handler contains them.

export const rateLimitConfig = {
  /** Requests each client address may make per window. */
  limit: 100,
  /** Length of one window, in seconds. */
  windowSeconds: 60,
  /**
   * How many proxies we control sit in front of the app. The client address is the entry that
   * many places from the end of X-Forwarded-For; anything before it was written by the client
   * and can't be trusted. 1 suits Vercel, Render, or a single Nginx / load balancer.
   */
  trustedProxies: 1,
} as const;

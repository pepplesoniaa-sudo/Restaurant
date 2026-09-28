import type { NextRequest } from 'next/server';
import { rateLimitConfig } from '@/config/rate-limit';
import { createRateLimiter } from '@/lib/rate-limit';

// Runs before every /api route (README, Rate limiting). The numbers are in config/rate-limit.ts.

const limitRequests = createRateLimiter(rateLimitConfig);

export function proxy(request: NextRequest): Response | undefined {
  return limitRequests(request);
}

export const config = {
  matcher: '/api/:path*',
};

import type { NextRequest } from 'next/server';
import { rateLimitConfig } from '@/config/rate-limit';
import { createRateLimiter } from '@/lib/rate-limit';
import { postgresRateLimitStore } from '@/lib/rate-limit-store';

// Runs before every /api route (README, Rate limiting). The numbers are in config/rate-limit.ts;
// the counts are in PostgreSQL, shared by every server process.

const limitRequests = createRateLimiter(rateLimitConfig, postgresRateLimitStore);

export function proxy(request: NextRequest): Promise<Response | undefined> {
  return limitRequests(request);
}

export const config = {
  matcher: '/api/:path*',
};

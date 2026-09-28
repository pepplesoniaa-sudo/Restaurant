import { NextResponse, type NextRequest } from 'next/server';
import { corsConfig } from '@/config/cors';
import { rateLimitConfig } from '@/config/rate-limit';
import { corsHeaders, preflightResponse, withCors } from '@/lib/cors';
import { createRateLimiter } from '@/lib/rate-limit';
import { postgresRateLimitStore } from '@/lib/rate-limit-store';

// Runs before every /api route (README, Rate limiting; Calling from a browser). The numbers are
// in config/; rate-limit counts are in PostgreSQL, shared by every server process.

const limitRequests = createRateLimiter(rateLimitConfig, postgresRateLimitStore);

export async function proxy(request: NextRequest): Promise<Response> {
  // A browser's preflight check reads nothing, so it is answered at once and not counted.
  if (request.method === 'OPTIONS') return preflightResponse(corsConfig);

  const refused = await limitRequests(request);
  if (refused !== undefined) return withCors(refused, corsConfig);

  return NextResponse.next({ headers: corsHeaders(corsConfig) });
}

export const config = {
  matcher: '/api/:path*',
};

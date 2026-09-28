// CORS headers for every /api response (README, Calling from a browser).

export type CorsConfig = {
  allowOrigin: string;
  allowMethods: readonly string[];
  allowHeaders: readonly string[];
  exposeHeaders: readonly string[];
  maxAgeSeconds: number;
};

/** Headers every API response carries, so browsers let other sites read it. */
export function corsHeaders(config: CorsConfig): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': config.allowOrigin,
    'Access-Control-Expose-Headers': config.exposeHeaders.join(', '),
  };
}

/** The answer to a browser's preflight check: no body, just what is allowed. */
export function preflightResponse(config: CorsConfig): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(config),
      'Access-Control-Allow-Methods': config.allowMethods.join(', '),
      'Access-Control-Allow-Headers': config.allowHeaders.join(', '),
      'Access-Control-Max-Age': String(config.maxAgeSeconds),
    },
  });
}

/** Adds the CORS headers to a response the proxy produced itself (e.g. a 429). */
export function withCors(response: Response, config: CorsConfig): Response {
  for (const [name, value] of Object.entries(corsHeaders(config))) {
    response.headers.set(name, value);
  }
  return response;
}

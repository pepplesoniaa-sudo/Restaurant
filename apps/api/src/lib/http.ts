// Response helpers shared by every route. Error bodies are generic on purpose: details go to the
// log, never to the caller (.agents/rules/security.md).

/** The request body as JSON, or `undefined` if it isn't JSON; schema validation then rejects it. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    // Malformed JSON is the caller's mistake, not a server fault, so there is nothing to log.
    return undefined;
  }
}

export function ok<T>(body: T): Response {
  return Response.json(body);
}

export function created<T>(body: T): Response {
  return Response.json(body, { status: 201 });
}

/** The request was well-formed but broke a rule; `body` says which, using caller-sent ids only. */
export function unprocessable<T>(body: T): Response {
  return Response.json(body, { status: 422 });
}

export function badRequest(): Response {
  return Response.json({ error: 'Bad request' }, { status: 400 });
}

/** No valid staff key. The body never says whether the key was missing, malformed or unknown. */
export function unauthorized(): Response {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  );
}

/** The request was valid but the resource changed under it; the caller should re-read and retry. */
export function conflict<T>(body: T): Response {
  return Response.json(body, { status: 409 });
}

export function notFound(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export function serverError(): Response {
  return Response.json({ error: 'Something went wrong' }, { status: 500 });
}

// Response helpers shared by every route. Error bodies are generic on purpose: details go to the
// log, never to the caller (.agents/rules/security.md).

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

export function notFound(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export function serverError(): Response {
  return Response.json({ error: 'Something went wrong' }, { status: 500 });
}

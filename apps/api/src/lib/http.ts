import type { ErrorCode, ListEnvelope } from '@restaurant/contracts';

// Response helpers shared by every route (README, Responses). Success is `{ data }` or
// `{ data, meta }`; every error is `{ error: { code, message } }`. Messages describe what the
// caller sent, never server internals: those go to the log (.agents/rules/security.md).

/** The request body as JSON, or `undefined` if it isn't JSON; schema validation then rejects it. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    // Malformed JSON is the caller's mistake, not a server fault, so there is nothing to log.
    return undefined;
  }
}

export function ok<T>(data: T): Response {
  return Response.json({ data });
}

export function okList<T>(list: ListEnvelope<T>): Response {
  return Response.json(list);
}

export function created<T>(data: T): Response {
  return Response.json({ data }, { status: 201 });
}

export function apiError(
  status: number,
  code: ErrorCode,
  message: string,
  headers?: Record<string, string>,
): Response {
  return Response.json({ error: { code, message } }, { status, ...(headers ? { headers } : {}) });
}

type ValidationIssues = { issues: readonly { path: readonly PropertyKey[]; message: string }[] };

/** 400 naming the first field that failed validation, e.g. `limit: Too big: expected number to be <=100`. */
export function invalid(error: ValidationIssues): Response {
  const issue = error.issues[0];
  const field =
    issue === undefined || issue.path.length === 0 ? 'body' : issue.path.map(String).join('.');
  return apiError(400, 'VALIDATION_ERROR', `${field}: ${issue?.message ?? 'Invalid request'}`);
}

/** No valid staff key. The message never says whether it was missing, malformed or unknown. */
export function unauthorized(): Response {
  return apiError(401, 'UNAUTHORIZED', 'A valid staff key is required', {
    'WWW-Authenticate': 'Bearer',
  });
}

export function forbidden(message: string): Response {
  return apiError(403, 'FORBIDDEN', message);
}

export function notFound(message: string): Response {
  return apiError(404, 'NOT_FOUND', message);
}

export function methodNotAllowed(): Response {
  return apiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported on this path');
}

export function conflict(code: ErrorCode, message: string): Response {
  return apiError(409, code, message);
}

export function unprocessable(code: ErrorCode, message: string): Response {
  return apiError(422, code, message);
}

export function serverError(): Response {
  return apiError(500, 'INTERNAL_ERROR', 'Something went wrong');
}

/** The query string as a plain object for schema parsing. A repeated key keeps its last value. */
export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

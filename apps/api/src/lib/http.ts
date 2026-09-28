import type { ErrorCode, ListEnvelope } from '@restaurant/contracts';

// Response helpers shared by every route (README, Responses). Success is `{ data }` or
// `{ data, meta }`; every error is `{ error: { code, message } }`. Messages describe what the
// caller sent, never server internals: those go to the log (.agents/rules/security.md).

type ValidationIssues = { issues: readonly { path: readonly PropertyKey[]; message: string }[] };

/** Any schema from `@restaurant/contracts`: the one place request rules live. */
type Schema<T> = {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: ValidationIssues };
};

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Reads and validates a JSON body (README, Responses). A body that isn't JSON at all is a
 * malformed request (400); JSON that breaks the schema, such as a missing field, is well-formed
 * but unprocessable (422). Either way the message names the field.
 */
export async function readBody<T>(req: Request, schema: Schema<T>): Promise<BodyResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    // The caller's mistake, not a server fault, so there is nothing to log.
    return {
      ok: false,
      response: apiError(400, 'VALIDATION_ERROR', 'body: Must be valid JSON'),
    };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: apiError(422, 'VALIDATION_ERROR', describeIssue(parsed.error)) };
}

function describeIssue(error: ValidationIssues): string {
  const issue = error.issues[0];
  const field =
    issue === undefined || issue.path.length === 0 ? 'body' : issue.path.map(String).join('.');
  return `${field}: ${issue?.message ?? 'Invalid request'}`;
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

/** 400 for a bad id or query parameter, naming it, e.g. `offset: Must be a whole number, 0 or more`. */
export function invalid(error: ValidationIssues): Response {
  return apiError(400, 'VALIDATION_ERROR', describeIssue(error));
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

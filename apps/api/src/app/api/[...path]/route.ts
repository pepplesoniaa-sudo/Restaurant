import { notFound } from '@/lib/http';

// Any /api path no route matches, including the old unversioned ones, still answers in the
// error envelope rather than with an HTML page (README, Responses).

function noSuchEndpoint(): Response {
  return notFound('No such endpoint. Every path starts with /api/v1/');
}

export {
  noSuchEndpoint as GET,
  noSuchEndpoint as POST,
  noSuchEndpoint as PUT,
  noSuchEndpoint as PATCH,
  noSuchEndpoint as DELETE,
};

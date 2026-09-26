---
name: api-route-scaffolder
description: Load before creating or changing any Next.js API route or request handler. Triggers: API route, route handler, endpoint, app/api, request, response, POST, GET, PATCH, handler.
---

# API Route Scaffolder

Teaches the outer shell every route shares, in the same order, before any domain work begins.
The shell is a front desk: it validates what the caller sent, hands off to a module, and returns
a safe answer. It never does the domain work itself.

Laws live in: security.md, money.md, coding-standards.md, AGENTS.md.

## Procedure

1. Keep the route file thin. It calls one module function. Business rules (totals, status
   transitions, same-restaurant checks) live in `modules/`, never in the route.
2. Validate and parse the body (and any route params) into a typed shape with the zod schema
   from `packages/contracts`. Reject anything that doesn't match with `400`.
3. Ignore any money the client sends. `total` and `unitPrice` are computed in the module
   (money.md).
4. Hand off to the module's public function, e.g. `orders.place(input)` or
   `menuItems.setAvailability(id, available)`. The route never touches Prisma directly.
5. Return a safe response shape: only the fields the caller needs, IDs as cuids, money as kobo
   integers. Never return another customer's data (security.md).
6. Wrap the handler in an error boundary. Log internally, return a generic failure, never a stack
   trace. Never swallow the error.

## Skeleton

```typescript
export async function POST(req: Request) {
  try {
    const input = PlaceOrderInput.safeParse(await req.json());
    if (!input.success) return badRequest(input.error);

    const order = await orders.place(input.data); // computes unitPrice + total itself

    return ok({ id: order.id, status: order.status, total: order.total });
  } catch (err) {
    log.error('place order failed', { err });
    return serverError();
  }
}
```

## Traps

- Writing to the database or applying order rules in the route file.
- Trusting a `total` or `price` from the request body.
- Returning a full Prisma record (with relations) instead of a shaped response.
- Leaking a raw error to the caller, or swallowing it so the route looks successful.

## Verify before done

- [ ] The route calls one module function and contains no business rules.
- [ ] The body is validated into a typed shape; bad input returns `400` before any module call.
- [ ] Client-sent money is ignored.
- [ ] The response contains only safe fields.
- [ ] Errors are logged internally and returned as a generic failure.
- [ ] Tests: invalid body rejected; valid request calls the module once; a thrown error returns a
      generic failure.

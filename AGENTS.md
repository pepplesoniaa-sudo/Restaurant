# AGENTS.md — Restaurant (Food Market)

> This file tells you, the coding agent, **how to behave** while building Restaurant.
> It does not tell you what to build. For that, read the data design in `README.md`.
> **`README.md` is the single source of truth for resources, fields and relationships.** When
> this file and the README disagree, stop and ask a human. Never resolve the conflict by guessing.

---

## 1. What is this project?

A food market. Restaurants list menu items; customers place orders with one restaurant at a time;
each order contains one or more order items. See `README.md` for the five resources, their fields,
and the one-page relationship diagram.

**Design before code.** No model, route or page is built for a resource until that resource's
fields, types, required flags and relationships are written in the README and agreed. If a change
cannot be drawn on the README's one-page diagram, the design is not ready — stop and ask.

---

## 2. What is locked

Do not change, swap, upgrade or add alternatives to anything in this section. If one seems wrong,
stop and ask.

### Stack

- **Backend and web:** Next.js with **TypeScript** (strict).
- **ORM:** **Prisma**. All database access goes through Prisma. No second ORM, no raw query builder.
- **Database:** **PostgreSQL**, the single system of record.
- **Runtime:** Node.js 22 LTS, pinned in `package.json` `engines`.

### Data model

- **The five resources are `Restaurant`, `MenuItem`, `Customer`, `Order`, `OrderItem`**, with the
  fields in the README. Do not rename, drop or retype a field.
- **Every `id` is a generated cuid (`@default(cuid())`).** Never an auto-incrementing integer —
  sequential IDs let anyone enumerate the dataset by counting.
- **Money is `Int` in kobo:** `deliveryFee`, `price`, `unitPrice`, `total`. Never `Float`, never
  `Decimal`, anywhere.
- **`Order.status` is the `OrderStatus` enum:** `PENDING`, `CONFIRMED`, `PREPARING`,
  `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`. Never free text.
- **`OrderItem.unitPrice` is copied from `MenuItem.price` when the order is placed** and never
  changes afterwards.
- The Prisma schema lives in exactly one place: `packages/db/schema.prisma`.

---

## 3. What must never happen

Breaking any rule here means the task has **failed**, even if the code compiles and tests pass.

- **A. Never trust a client-sent total or price.** The server computes `total` from `unitPrice ×
  quantity` plus the restaurant's `deliveryFee`, and copies `unitPrice` from the database.
- **B. Never mix restaurants in one order.** Every `OrderItem`'s menu item must belong to the
  order's restaurant.
- **C. Never order an unavailable item.** `MenuItem.available = false` blocks it from new orders.
- **D. Never delete a menu item that past orders reference.** Set `available = false` instead.
- **E. Never move an order backwards or skip a status.** `DELIVERED` and `CANCELLED` are final.
- **F. Never expose a sequential or guessable identifier** in a URL, response or log.
- **G. Never return one customer's orders or phone number to another caller.**
- **H. Never build a feature the README does not describe.** Accounts, payments, a mobile app and
  delivery tracking are out of scope until a human adds them.

---

## 4. How is the work arranged?

```
/
├─ AGENTS.md                  # this file
├─ README.md                  # data design — source of truth
├─ apps/
│  └─ api/                    # Next.js + TypeScript: API routes + web pages
│     └─ src/
│        ├─ app/              # routes (App Router)
│        ├─ modules/          # one folder per resource — business rules live here
│        │  ├─ restaurants/
│        │  ├─ menu-items/
│        │  ├─ customers/
│        │  └─ orders/        # Order + OrderItem (an order owns its items)
│        └─ lib/              # cross-cutting helpers — no business rules
├─ packages/
│  ├─ db/                     # schema.prisma + migrations
│  └─ contracts/              # shared types / zod schemas for API payloads
└─ package.json               # workspace root
```

- Business rules live in `modules/`, never in `lib/` or a route file.
- A route file validates input, calls one module function, and returns a safe response.

---

## 5. How should the code look?

- TypeScript strict mode everywhere. No `any` — type it or narrow from `unknown`.
- Small, single-purpose functions. Keep decision logic (totals, status transitions) pure so it is
  testable without a database.
- `async/await` only; no floating promises. Never swallow an error.
- One shared Prettier + ESLint config at the root; commit code formatted and lint-clean.
- No speculative code, config flags or abstractions for features the README doesn't list.

---

## 6. What counts as done?

End every task with this checklist, filled in:

- [ ] Build, lint and type-check pass with zero errors.
- [ ] The change matches the README's data design; any design change was agreed first.
- [ ] Every locked choice in Section 2 is intact (IDs are cuids, money is kobo `Int`, status is the enum).
- [ ] Every rule in Section 3 that the task touches is satisfied.
- [ ] Schema changes ship as a Prisma migration.
- [ ] Tests exist for the decision logic changed (totals, status transitions, validation).

If a box can't be checked, the task is **not** done. Report the blocker.

---

## 7. What does the agent do when unsure?

1. **Stop. Do not invent scope** — no field, table, endpoint or provider the README doesn't describe.
2. **State the ambiguity plainly**, pointing at the README section (or its "Open questions").
3. **Propose the smallest, most conservative option** and wait for a human decision.
4. **Never quietly change a locked choice or a Section 3 rule to unblock yourself.**

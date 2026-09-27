# Restaurant — Food Market

A food market where customers order from local restaurants. Restaurants list menu items, and
customers place orders against one restaurant at a time.

> **Design first, code second.** This README is the data design. Nothing in `packages/db` or
> `apps/api` gets built until the design below is agreed. If a change can't be drawn on the
> one-page diagram, the design isn't ready.

## Resources and how they relate

| Resource   | Key fields                                             | Relationship                                                     |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Restaurant | id, name, area, cuisine, rating, deliveryFee           | has many MenuItems, has many Orders                              |
| MenuItem   | id, restaurantId, name, category, price, available     | belongs to a Restaurant                                          |
| Customer   | id, name, phone, area                                  | places many Orders                                               |
| Order      | id, customerId, restaurantId, status, total, createdAt | belongs to a Customer and a Restaurant, contains many OrderItems |
| OrderItem  | id, orderId, menuItemId, quantity, unitPrice           | links an Order to a MenuItem                                     |

### The one-page diagram

```
                     ┌──────────────┐
                     │  Restaurant  │
                     └──────┬───────┘
               has many     │     has many
          ┌─────────────────┴──────────────────┐
          ▼                                    ▼
   ┌─────────────┐                      ┌─────────────┐  places many  ┌────────────┐
   │  MenuItem   │                      │    Order    │◄──────────────│  Customer  │
   └──────┬──────┘                      └──────┬──────┘               └────────────┘
          │                                    │ contains many
          │            ┌─────────────┐         │
          └───────────►│  OrderItem  │◄────────┘
      referenced by    └─────────────┘
```

**The foreign key sits on the "belongs to" side.** `MenuItem.restaurantId`,
`Order.customerId`, `Order.restaurantId`, `OrderItem.orderId` and `OrderItem.menuItemId` are the
five links. Nothing else points anywhere.

**OrderItem is the join between Order and MenuItem.** An order has many menu items, and a menu
item appears in many orders. OrderItem holds that many-to-many link, plus the facts that belong
to the pairing: how many (`quantity`) and at what price (`unitPrice`).

## Fields

Every field is **required** unless marked optional. Types are the Prisma types the schema will use.

### Restaurant

| Field       | Type      | Required | Notes                                                                |
| ----------- | --------- | -------- | -------------------------------------------------------------------- |
| id          | `String`  | yes      | Generated cuid — see [Identifiers](#identifiers)                     |
| name        | `String`  | yes      |                                                                      |
| area        | `String`  | yes      | Neighbourhood served, e.g. "Yaba", "Lekki Phase 1"                   |
| cuisine     | `String`  | yes      | e.g. "Nigerian", "Chinese", "Grills"                                 |
| rating      | `Decimal` | optional | 0.0–5.0, one decimal place. Typed in by hand — see [Rating](#rating) |
| deliveryFee | `Int`     | yes      | **Kobo.** ₦1,500 is stored as `150000`. `0` means free delivery      |

### MenuItem

| Field        | Type      | Required | Notes                                                                     |
| ------------ | --------- | -------- | ------------------------------------------------------------------------- |
| id           | `String`  | yes      | Generated cuid                                                            |
| restaurantId | `String`  | yes      | → Restaurant.id                                                           |
| name         | `String`  | yes      | e.g. "Jollof rice & chicken"                                              |
| category     | `String`  | yes      | The restaurant's own grouping, e.g. "Mains", "Drinks"                     |
| price        | `Int`     | yes      | **Kobo.** Must be greater than 0                                          |
| available    | `Boolean` | yes      | Defaults to `true`. Set to `false` to hide an item instead of deleting it |

### Customer

| Field | Type     | Required | Notes                                |
| ----- | -------- | -------- | ------------------------------------ |
| id    | `String` | yes      | Generated cuid                       |
| name  | `String` | yes      |                                      |
| phone | `String` | yes      | **Unique.** Stored in `+234…` format |
| area  | `String` | yes      | Where the customer usually orders to |

### Order

| Field        | Type          | Required | Notes                                                        |
| ------------ | ------------- | -------- | ------------------------------------------------------------ |
| id           | `String`      | yes      | Generated cuid                                               |
| customerId   | `String`      | yes      | → Customer.id                                                |
| restaurantId | `String`      | yes      | → Restaurant.id                                              |
| status       | `OrderStatus` | yes      | Enum, defaults to `PENDING` — see below                      |
| total        | `Int`         | yes      | **Kobo.** Worked out on the server, never sent by the client |
| createdAt    | `DateTime`    | yes      | Set by the database when the row is created                  |

### OrderItem

| Field      | Type     | Required | Notes                                                          |
| ---------- | -------- | -------- | -------------------------------------------------------------- |
| id         | `String` | yes      | Generated cuid                                                 |
| orderId    | `String` | yes      | → Order.id                                                     |
| menuItemId | `String` | yes      | → MenuItem.id                                                  |
| quantity   | `Int`    | yes      | 1 or more                                                      |
| unitPrice  | `Int`    | yes      | **Kobo.** A copy of `MenuItem.price` at the moment of ordering |

**Why `unitPrice` exists.** If a restaurant raises a price next week, last week's orders must
still show what the customer actually paid. Reading the price live from `MenuItem` would rewrite
history, so each order line keeps its own copy.

## Order status

`status` is a fixed list (a Prisma enum), never free text:

```
PENDING → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
    └──────────┴──────────┴──────► CANCELLED
```

An order moves forward one step at a time. It can't skip a step or go backwards. `DELIVERED` and
`CANCELLED` are final.

## Decisions

### Identifiers

Every `id` is a **generated cuid** (`@default(cuid())`, e.g. `clx8k2j9d0000qz8h3v1f7a2b`), never an
auto-incrementing integer.

With counting numbers, anyone who sees `/orders/57` can try `/orders/58`, `/orders/59` and so on.
That reveals how many orders exist and lets someone walk the whole dataset. A cuid can't be
guessed from another one.

### Money is whole kobo

`deliveryFee`, `price`, `unitPrice` and `total` are all `Int` in **kobo**, the smallest unit of the
naira. Never `Float` or `Decimal`. Floating-point numbers can't hold amounts like 0.1 exactly, so
totals slowly drift. Integers add up exactly. Convert to naira only when displaying.

### Rules the data must keep

- **An order comes from one restaurant.** Every `OrderItem` on an order must point to a `MenuItem`
  whose `restaurantId` matches the order's `restaurantId`.
- **`total` = sum of (`unitPrice` × `quantity`) + the restaurant's `deliveryFee` at the time of
  ordering.** The server computes it; a total sent by the client is ignored.
- **Only available items can be ordered.** A `MenuItem` with `available = false` can't be added to
  a new order.
- **Menu items are hidden, not deleted.** Past orders point at them, so switch `available` to
  `false` instead of deleting the row.

### Rating

`rating` is the star score shown next to a restaurant (e.g. ★ 4.3). For now it is **typed in by
hand** by whoever manages the site, like a price. Empty means "no rating yet" — never a made-up
number.

Customer reviews (1–5 stars after delivery, averaged into `rating`) would need a sixth resource,
`Review`, to store each score. That is a separate design change, not part of this one.

### Cancelling

An order can be cancelled from `PENDING`, `CONFIRMED` or `PREPARING`. Once it is
`OUT_FOR_DELIVERY`, it can only become `DELIVERED`.

### Access (until sign-in exists)

There are no accounts yet, so the server cannot tell who is calling. Until that is designed:

- **Restaurants and menu items are public to read.** They hold no personal data.
- **Placing an order is open.** The response returns the new order to the caller who sent it,
  and nothing else. The customer's phone number, name and id are never echoed back.
- **An order finds or creates its customer by phone.** The order carries the customer's name,
  phone and area. If a customer with that phone already exists, the order is attached to them
  and their stored name and area are left unchanged. Otherwise a new customer is created.
- **Phone must already be in `+234` format:** `+234` followed by 10 digits, e.g.
  `+2348031234567`. Any other format is rejected, not converted.
- **Nothing reads or lists orders or customers.** No endpoint returns an existing order or a
  customer record, so one caller can never see another customer's orders or phone number.
- **Nothing changes an order's status or edits a menu.** Those actions need a restaurant or
  operator role, which is an open question below.

### Listing restaurants is paginated

The restaurant list is returned a page at a time, so it stays fast however many restaurants join.

- **Cursor-based:** `GET /api/restaurants?limit=20&cursor=<id>` returns
  `{ items, nextCursor }`. Pass `nextCursor` back to get the next page; it is `null` on the last
  page. The cursor is the last restaurant's id, which is already public.
- **Stable order:** by `name`, then `id`, so pages don't shift when a restaurant is added.
- **Page size:** 20 by default, at most 100. A `limit` outside 1–100 is rejected with `400`.
- **Menus are not paginated.** A restaurant's menu is short enough to return whole.

## Open questions

1. **Who can move an order's status and edit a menu?** This needs some form of restaurant or
   operator sign-in. That is a design change (new fields or a new resource on the diagram) and
   waits for a human decision.
2. **How does a customer check on an order after placing it?** This needs customer sign-in or a
   secret per-order link. It is not decided yet. Until then, the only customer data the API
   returns is the response to the order the caller just placed.
   **Known gap:** because orders find their customer by phone, anyone who types a stranger's
   number attaches orders to that stranger's record. That is harmless while nothing reads order
   history, but it must be closed (e.g. by confirming the phone) before any order history becomes
   readable.

## What's in this repository

The structure, tooling and database schema are in place. No routes or features are built yet.

```
apps/api/            Next.js + TypeScript: API routes and web pages
  src/app/           Routes (App Router)
  src/modules/       One folder per resource: restaurants, menu-items, customers, orders
  src/lib/           Cross-cutting helpers (no business rules)
packages/db/         Prisma schema + migrations (the only copy of the schema)
packages/contracts/  Shared TypeScript types / zod schemas for API payloads
.agents/             Rules and skills the coding agent follows
```

**Stack:** Next.js, TypeScript (strict), Prisma, PostgreSQL, Node.js 22 LTS.

**Not in scope yet:** sign-in or accounts, payments, a mobile app, delivery tracking.

## Running it

```bash
npm install                 # once, at the root — this is an npm workspace
cp .env.example .env        # then set DATABASE_URL
npx prisma migrate dev      # creates the tables from packages/db/schema.prisma
npm run db:seed             # optional: loads a few hundred realistic rows per resource
npm run dev                 # http://localhost:3002
```

`db:seed` (in `packages/db/seed/`) **clears all five tables** and reloads them in one
transaction, so it is safe to run as often as you like on a development database and never
creates duplicates. It refuses to run when `NODE_ENV=production`. The data is generated with
Faker from a fixed seed; nothing is loaded from a dump.

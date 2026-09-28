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

| Field        | Type      | Required | Notes                                                                                                                                        |
| ------------ | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| id           | `String`  | yes      | Generated cuid — see [Identifiers](#identifiers)                                                                                             |
| name         | `String`  | yes      |                                                                                                                                              |
| area         | `String`  | yes      | Neighbourhood served, e.g. "Yaba", "Lekki Phase 1"                                                                                           |
| cuisine      | `String`  | yes      | e.g. "Nigerian", "Chinese", "Grills"                                                                                                         |
| rating       | `Decimal` | optional | 0.0–5.0, one decimal place. Typed in by hand — see [Rating](#rating)                                                                         |
| deliveryFee  | `Int`     | yes      | **Kobo.** ₦1,500 is stored as `150000`. `0` means free delivery                                                                              |
| staffKeyHash | `String`  | optional | Unique. SHA-256 hash of the restaurant's staff key — see [Restaurant staff access](#restaurant-staff-access). Never returned by any endpoint |

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

| Field             | Type          | Required | Notes                                                                                                                                                     |
| ----------------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                | `String`      | yes      | Generated cuid                                                                                                                                            |
| customerId        | `String`      | yes      | → Customer.id                                                                                                                                             |
| restaurantId      | `String`      | yes      | → Restaurant.id                                                                                                                                           |
| status            | `OrderStatus` | yes      | Enum, defaults to `PENDING` — see below                                                                                                                   |
| total             | `Int`         | yes      | **Kobo.** Worked out on the server, never sent by the client                                                                                              |
| createdAt         | `DateTime`    | yes      | Set by the database when the row is created                                                                                                               |
| trackingTokenHash | `String`      | optional | SHA-256 hash of the order's tracking token — see [Tracking an order](#tracking-an-order). Never returned. Empty for orders placed before tracking existed |

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

### Operational tables

Tables the API needs to run that are **not** part of the food market: they belong to no resource,
point at nothing, and nothing points at them, so they don't appear on the diagram.

#### RateLimitWindow

One row per client address currently being rate-limited — see [Rate limiting](#rate-limiting).

| Field       | Type       | Required | Notes                                                       |
| ----------- | ---------- | -------- | ----------------------------------------------------------- |
| id          | `String`   | yes      | Generated cuid, like every other table                      |
| key         | `String`   | yes      | **Unique.** The client address the budget belongs to        |
| windowStart | `DateTime` | yes      | When this address's current window began                    |
| count       | `Int`      | yes      | Requests made in the current window, including refused ones |

Rows for finished windows are deleted regularly, so the table only ever holds addresses seen in
the last few minutes. Client addresses are kept no longer than that.

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

There are no customer accounts yet, so the server can't tell which customer is calling. Until
that is designed:

- **Restaurants and menus are public to read.** They hold no personal data. Hidden menu items
  are visible only to that restaurant's own staff.
- **Placing an order is open.** The response returns the new order to the caller who sent it,
  and nothing else. The customer's phone number, name and id are never echoed back.
- **An order finds or creates its customer by phone.** The order carries the customer's name,
  phone and area. If a customer with that phone already exists, the order is attached to them
  and their stored name and area are left unchanged. Otherwise a new customer is created.
- **Phone must already be in `+234` format:** `+234` followed by 10 digits, e.g.
  `+2348031234567`. Any other format is rejected, not converted.
- **Only a restaurant's own staff read, change or cancel its orders, or change its menu.** See
  [Restaurant staff access](#restaurant-staff-access).
- **A customer can read one order: the one they placed**, using its tracking token. See
  [Tracking an order](#tracking-an-order). Nobody else can read an order.
- **Customers have no endpoints of their own.** A customer list would hand out phone numbers
  (rule G), so `Customer` is only ever reached through a restaurant's own orders.

### Tracking an order

A customer checks on their order with the order's **tracking token**: a long random secret
returned once, as `trackingToken`, in the response to `POST /api/v1/orders`.

- **It unlocks one order, for reading only.** Sent as `Authorization: Bearer <token>` to
  `GET /api/v1/orders/{id}`, it returns that order's status, total, time and items. It can't
  change or cancel the order, list orders, or read any other order.
- **No customer data comes back**, not even the customer's own name or phone: the caller
  already knows them, and a leaked token then leaks nothing personal.
- **A wrong token looks like a missing order** (`404`), so a token can't be used to learn
  whether some other order id exists.
- **Only a hash is stored** (`Order.trackingTokenHash`). A lost token can't be recovered or
  reissued; the restaurant can still see the order.
- **Header, not URL.** A token in a link would end up in browser history, logs and referrers.
- Orders placed before tracking existed (including all seed data) have no token and can't be
  tracked.

### Restaurant staff access

Each restaurant manages its own orders and menu. A restaurant's staff prove who they are with
that restaurant's **staff key**: a long random secret, sent as `Authorization: Bearer <key>`.

**How keys work**

- **One key per restaurant.** The key identifies the restaurant, so every staff request only
  ever sees that one restaurant's data.
- **Only a hash is stored** (`Restaurant.staffKeyHash`). The key itself is shown once, when it is
  issued, and can't be recovered from the database. A leaked database dump doesn't leak keys.
- **Issued by the site manager, not over the API.** A script (`npm run staff-key -- <restaurantId>`)
  prints a new key. Running it again replaces the key, and the old one stops working at once.
  There is no endpoint that creates or shows keys.
- **A restaurant with no key can't be managed** until one is issued.
- **A wrong or malformed key gets `401`** with no hint as to why, even on endpoints that are
  otherwise public: a bad key is never silently treated as "no key".

**What staff can do** is marked "staff" in the [API](#api-version-1) table. On top of that:

- **Another restaurant's order or menu item looks like it doesn't exist** (`404`), so staff
  can't learn which ids belong to someone else. Adding an item to another restaurant's menu is
  `403`: that restaurant is public, so pretending it doesn't exist would be dishonest.
- **The customer's phone is shown only while the order is active** (not `DELIVERED` or
  `CANCELLED`). Staff need it to deliver; they don't need a list of past customers' numbers.
- **Changing a price never changes past orders**, because each order line keeps its own
  `unitPrice`.
- **Nothing is deleted.** Menu items are hidden with `available = false` (rule D), and
  `DELETE` on an order cancels it: the order is kept with status `CANCELLED`.

**What staff can't do**

- Change their restaurant's `rating`. It is set by the site manager (see [Rating](#rating));
  a restaurant rating itself would make the score meaningless.
- Change their restaurant's `name`, `area`, `cuisine` or `deliveryFee`. That is the site
  manager's job for now; it can be opened up later.
- See any customer data except on their own restaurant's orders.

## API (version 1)

Every path starts with **`/api/v1/`**. Versioning from the first release means a later,
incompatible change ships as `/api/v2/` while `/api/v1/` keeps working for existing clients.
Resources are plural nouns and the HTTP method carries the verb.

| Method and path                      | Who                                                              | Does                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/v1/restaurants`            | anyone                                                           | Lists restaurants                                                                    |
| `GET /api/v1/restaurants/{id}`       | anyone                                                           | One restaurant                                                                       |
| `GET /api/v1/restaurants/{id}/menu`  | anyone; that restaurant's staff also see hidden items            | Lists the restaurant's menu items                                                    |
| `POST /api/v1/restaurants/{id}/menu` | staff of that restaurant                                         | Adds a menu item (`name`, `category`, `price`); it starts available                  |
| `GET /api/v1/menu-items/{id}`        | anyone; a hidden item only to its own staff                      | One menu item                                                                        |
| `PATCH /api/v1/menu-items/{id}`      | staff of its restaurant                                          | Changes `name`, `category`, `price` and/or `available`                               |
| `POST /api/v1/orders`                | anyone                                                           | Places an order; the response includes its tracking token, shown only this once      |
| `GET /api/v1/orders`                 | staff                                                            | Lists their restaurant's orders                                                      |
| `GET /api/v1/orders/{id}`            | staff of its restaurant, or the customer with its tracking token | One order. Staff also see the customer; the customer sees only the order             |
| `PATCH /api/v1/orders/{id}`          | staff of its restaurant                                          | Moves `status` one step (see [Order status](#order-status)); nothing else can change |
| `DELETE /api/v1/orders/{id}`         | staff of its restaurant                                          | Cancels the order; allowed until it is out for delivery                              |

### Responses

Every response uses one envelope. A single resource:

```json
{ "data": { "id": "clx8k2j9d0000qz8h3v1f7a2b", "name": "Mama Put" } }
```

A list:

```json
{ "data": [ ... ], "meta": { "total": 340, "limit": 20, "offset": 0, "hasMore": true } }
```

Every error, from every endpoint, including unknown paths and unsupported methods:

```json
{ "error": { "code": "NOT_FOUND", "message": "Restaurant not found" } }
```

| Status | `code`                                                                                                                      | When                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`                                                                                                          | A bad id or query parameter, or a body that isn't JSON; the message names the field  |
| 422    | `VALIDATION_ERROR`                                                                                                          | A JSON body that breaks the rules, e.g. a missing field; the message names the field |
| 401    | `UNAUTHORIZED`                                                                                                              | A staff endpoint without a valid key, or any request with an invalid key             |
| 403    | `FORBIDDEN`                                                                                                                 | Staff acting on a restaurant that isn't theirs                                       |
| 404    | `NOT_FOUND`                                                                                                                 | No such resource, or not visible to this caller                                      |
| 405    | `METHOD_NOT_ALLOWED`                                                                                                        | The path exists but not with that method                                             |
| 409    | `INVALID_TRANSITION`, `STATUS_CHANGED`                                                                                      | A status change the rules forbid, or someone else changed the order first            |
| 422    | `ITEM_NOT_FOUND`, `ITEM_FROM_OTHER_RESTAURANT`, `ITEM_UNAVAILABLE`, `DUPLICATE_ITEM`, `INVALID_QUANTITY`, `TOTAL_TOO_LARGE` | An order breaks a rule; the message says which item                                  |
| 429    | `RATE_LIMITED`                                                                                                              | Too many requests from one address; `Retry-After` says how many seconds to wait      |
| 500    | `INTERNAL_ERROR`                                                                                                            | Anything unexpected. Details are logged, never returned                              |

### Lists: pagination, filtering and sorting

Every list endpoint takes the same parameters:

- **Pagination:** `?limit=` (default 20, at most 100; a larger limit is clamped to 100, and
  `meta.limit` shows the size used) and `?offset=` (default 0). `meta.total`
  is the number of matching rows and `meta.hasMore` says whether another page exists. Offset
  pages can shift if rows are added while someone is paging; at this scale that is accepted.
- **Sorting:** `?sort=<field>&order=asc|desc`. The id always breaks ties, so the order is fixed.
  Restaurants with no rating always sort last.
- **Filtering:** by the fields below. Money filters are in kobo.
- **Every other invalid value is rejected with `400`** naming the parameter, never ignored or
  coerced: a limit below 1, a negative or fractional number, an unknown sort field, a filter
  value of the wrong type, or a minimum greater than its maximum.
- **The rules live in one place:** every query, id and body is parsed by a zod schema in
  `packages/contracts` before any route logic runs.

| List                            | Filters                                                                                                         | `sort` fields (default first)           | Default `order` |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------- |
| `/api/v1/restaurants`           | `area`, `cuisine` (exact, any case), `minRating`, `maxDeliveryFee`                                              | `name`, `rating`, `deliveryFee`         | `asc`           |
| `/api/v1/restaurants/{id}/menu` | `category` (exact, any case), `minPrice`, `maxPrice`, `available` (staff; others only ever see available items) | `category` (then name), `name`, `price` | `asc`           |
| `/api/v1/orders`                | `status`, `from` and `to` (ISO 8601 date-times on `createdAt`)                                                  | `createdAt`, `total`                    | `desc`          |

### Rate limiting

Most of the API needs no key, so each client address gets a request budget: by default **100
requests per minute**, across every `/api/` path, staff and customers alike. Request 101 gets
`429 Too Many Requests` with a `Retry-After` header (seconds until the budget resets) and the
usual error envelope. The limit runs before any route, in `apps/api/src/proxy.ts`.

- **The numbers live in one file:** `apps/api/src/config/rate-limit.ts` (`limit`,
  `windowSeconds`, `trustedProxies`). No handler contains a rate-limit number.
- **Fixed window per address.** A client's minute starts with its first request; the count
  resets when the minute ends.
- **Counts are kept in PostgreSQL** (`RateLimitWindow`), so every server process shares one
  count and a restart doesn't reset it. Each request is counted with one atomic SQL statement,
  so simultaneous requests can't slip past the limit. It costs one database write per request.
- **If the database can't be reached, requests are let through** and the failure is logged:
  every route needs the database anyway, so refusing would only add a second, confusing error.
- **Finished windows are deleted** at most once per window length per server process.
- **The client address comes from `X-Forwarded-For`**, because Next.js does not expose the
  connection's own address. A client can write that header itself, so only the entries added by
  proxies we control are trusted: with `trustedProxies: 1` (the default), the **last** address
  in the header, the one the nearest proxy appended. **Always deploy behind a proxy that appends
  to `X-Forwarded-For`** (Vercel, Render, Nginx and most load balancers do). On a bare
  `next start`, a client that forges the header can dodge the limit.

## Open questions

1. **Known gap: anyone can place an order under a stranger's phone number.** Orders find their
   customer by phone, so typing someone else's number attaches the order to their record. That
   is harmless today because no customer can read an order history, only single orders by
   token. It must be closed (e.g. by confirming the phone) before order history becomes
   readable.

## What's in this repository

Built so far: the schema and its migrations, the version 1 API described above, the staff key
script and a repeatable seed script.

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
Faker from a fixed seed; nothing is loaded from a dump. Seeding also clears every staff key.

To let a restaurant's staff in, issue it a key (see
[Restaurant staff access](#restaurant-staff-access)):

```bash
npm run staff-key -- <restaurantId>   # prints a new key once; replaces any previous key
```

# Restaurant — Food Market

A food market where customers order from local restaurants in Lagos. Restaurants list menu items,
and customers place orders against one restaurant at a time.

This README is both the **API documentation** (start at [Using the API](#using-the-api)) and
the project's **data design** (see [Data design](#data-design)).

> **Design first, code second.** Nothing in `packages/db` or `apps/api` gets built until the
> design below is agreed. If a change can't be drawn on the one-page diagram, the design isn't
> ready.

## Contents

- [Quick start](#quick-start)
- [Using the API](#using-the-api)
  - [Basics](#basics) · [Authentication](#authentication) · [Responses](#responses) ·
    [Errors](#errors) · [Lists](#lists-pagination-filtering-and-sorting) ·
    [Rate limiting](#rate-limiting)
  - Endpoints: [Restaurants](#restaurants) · [Menus](#menus) · [Orders](#orders) ·
    [Order status](#order-status)
- [Design decisions](#design-decisions)
- [Data design](#data-design)
- [Open questions](#open-questions)
- [What's in this repository](#whats-in-this-repository)

## Quick start

```bash
npm install                 # once, at the root — this is an npm workspace
cp .env.example .env        # then set DATABASE_URL
npx prisma migrate dev      # creates the tables from packages/db/schema.prisma
npm run db:seed             # optional: loads a few hundred realistic rows per resource
npm run dev                 # the API is now at http://localhost:3002/api/v1
```

`db:seed` (in `packages/db/seed/`) **clears all five tables** and reloads them in one
transaction, so it is safe to run as often as you like on a development database and never
creates duplicates. The data is generated with Faker from a fixed seed; nothing is loaded from a
dump. Seeding also clears every staff key.

Because it wipes whatever database it points at, the seed only runs against a local database.
For any other host it refuses unless you name that host, e.g.
`npm run db:seed -- --confirm-wipe ep-example-123.eu-central-1.aws.neon.tech`. It always
refuses when `NODE_ENV=production`.

To let a restaurant's staff in, issue it a key (see
[Restaurant staff access](#restaurant-staff-access)):

```bash
npm run staff-key -- <restaurantId>   # prints a new key once; replaces any previous key
```

In production, run `npx prisma migrate deploy` instead of `migrate dev`, and deploy behind a
proxy that sets `X-Forwarded-For` (see [How rate limiting works](#how-rate-limiting-works)).

## Using the API

### Basics

- **Base URL:** `http://localhost:3002/api/v1` locally. Every path starts with `/api/v1/`.
- **JSON in, JSON out.** Send request bodies as JSON with `Content-Type: application/json`.
- **Money is whole kobo** (₦1 = 100 kobo), always an integer: ₦1,500 is `150000`. Divide by 100
  to display naira. Never send money to the API; it works out every price and total itself.
- **Ids are cuid strings**, e.g. `cmulfzeru001dwjc45zpzkaj2`. An id in any other shape is
  rejected with `400` before anything is looked up.
- **Times are ISO 8601 in UTC**, e.g. `2026-09-28T16:08:50.697Z`.

The examples below use these shell variables:

```bash
BASE=http://localhost:3002/api/v1
STAFF_KEY=rsk_...        # a restaurant's staff key, from `npm run staff-key`
TRACKING_TOKEN=otk_...   # an order's tracking token, from the response to POST /orders
```

The ids in the examples are real responses from one seeded database. Seeding generates new ids
every time, so on your machine take them from the API instead: a restaurant id from
`GET /restaurants`, a menu item id from its menu, an order id from `POST /orders`.

### Authentication

There are no user accounts. Each endpoint is open to one or more of three kinds of caller:

| Caller                        | How they identify themselves                                    | What they can do                                                       |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Anyone**                    | No `Authorization` header                                       | Browse restaurants and menus; place an order                           |
| **A restaurant's staff**      | `Authorization: Bearer rsk_…` — that restaurant's **staff key** | Everything on their own restaurant's orders and menu, and nothing else |
| **The customer of one order** | `Authorization: Bearer otk_…` — that order's **tracking token** | Read that one order                                                    |

- A **staff key** is issued by the site manager with `npm run staff-key -- <restaurantId>`. It
  is shown once. There is no endpoint that creates or shows keys.
- A **tracking token** is returned once, as `trackingToken`, when the order is placed. Keep it:
  it can't be shown again.
- **A wrong or malformed key is always `401`**, even on endpoints anyone may call. A bad key is
  never quietly treated as "no key".

### Responses

Every successful response is JSON in one of two shapes. A single resource:

```json
{ "data": { "id": "cmulfzeru001dwjc45zpzkaj2", "name": "The Nigerian Place" } }
```

A list, with paging information in `meta`:

```json
{ "data": [ ... ], "meta": { "total": 7, "limit": 2, "offset": 0, "hasMore": true } }
```

### Errors

Every error, from every endpoint (including unknown paths and unsupported methods), has the same
shape and an honest HTTP status:

```json
{ "error": { "code": "NOT_FOUND", "message": "Restaurant not found" } }
```

`code` is stable and meant for programs; `message` is for people and names the field at fault
where there is one.

| Status | `code`                                                                                                                      | When                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`                                                                                                          | A bad id or query parameter, or a body that isn't JSON; the message names the field  |
| 401    | `UNAUTHORIZED`                                                                                                              | A staff-only endpoint without a valid key, or any request with an invalid key        |
| 403    | `FORBIDDEN`                                                                                                                 | Staff acting on a restaurant that isn't theirs                                       |
| 404    | `NOT_FOUND`                                                                                                                 | No such resource, or one this caller may not see                                     |
| 405    | `METHOD_NOT_ALLOWED`                                                                                                        | The path exists but not with that method                                             |
| 409    | `INVALID_TRANSITION`, `STATUS_CHANGED`                                                                                      | A status change the rules forbid, or someone else changed the order first            |
| 422    | `VALIDATION_ERROR`                                                                                                          | A JSON body that breaks the rules, e.g. a missing field; the message names the field |
| 422    | `ITEM_NOT_FOUND`, `ITEM_FROM_OTHER_RESTAURANT`, `ITEM_UNAVAILABLE`, `DUPLICATE_ITEM`, `INVALID_QUANTITY`, `TOTAL_TOO_LARGE` | An order breaks a rule; the message names the menu item                              |
| 429    | `RATE_LIMITED`                                                                                                              | Too many requests from one address; the `Retry-After` header says how long to wait   |
| 500    | `INTERNAL_ERROR`                                                                                                            | Anything unexpected. Details are logged on the server, never returned                |

Some real examples:

```text
GET /api/v1/restaurants?sort=popularity
400 {"error":{"code":"VALIDATION_ERROR","message":"sort: Invalid option: expected one of \"name\"|\"rating\"|\"deliveryFee\""}}

GET /api/v1/restaurants?offset=-1
400 {"error":{"code":"VALIDATION_ERROR","message":"offset: Must be a whole number, 0 or more"}}

GET /api/v1/restaurants/57
400 {"error":{"code":"VALIDATION_ERROR","message":"restaurantId: Invalid cuid"}}

POST /api/v1/orders   (body without customer.phone)
422 {"error":{"code":"VALIDATION_ERROR","message":"customer.phone: Required"}}

DELETE /api/v1/restaurants
405 {"error":{"code":"METHOD_NOT_ALLOWED","message":"This method is not supported on this path"}}
```

### Lists: pagination, filtering and sorting

Every list endpoint (`GET /restaurants`, `GET /restaurants/{id}/menu`, `GET /orders`) takes the
same paging and sorting parameters. Each endpoint's own section lists its filters and sort
fields.

| Parameter | Type                     | Default             | Notes                                                                                 |
| --------- | ------------------------ | ------------------- | ------------------------------------------------------------------------------------- |
| `limit`   | whole number, 1 or more  | `20`                | Page size. **Anything above 100 is clamped to 100**; `meta.limit` shows the size used |
| `offset`  | whole number, 0 or more  | `0`                 | How many matching rows to skip. Next page: `offset + limit`                           |
| `sort`    | one of the list's fields | depends on the list | Unknown field → `400`                                                                 |
| `order`   | `asc` or `desc`          | depends on the list |                                                                                       |

- `meta.total` is how many rows match the filters; `meta.hasMore` is `true` while another page
  exists. To read everything: keep adding `limit` to `offset` until `hasMore` is `false`.
- The id always breaks ties, so the order is fixed and pages don't overlap.
- Every other invalid value is rejected with `400` naming the parameter, never ignored or
  coerced: a limit below 1, a negative or fractional number, an unknown sort field, a filter
  value of the wrong type, or a minimum greater than its maximum.

### Rate limiting

Each client address may make **100 requests per minute** across the whole API. Request 101 gets:

```text
HTTP/1.1 429 Too Many Requests
Retry-After: 59

{"error":{"code":"RATE_LIMITED","message":"Too many requests; try again in 59 seconds"}}
```

Wait the number of seconds in `Retry-After`, then carry on. How the limit works is described in
[How rate limiting works](#how-rate-limiting-works).

### Endpoints

**The base URL answers too.** `GET /api/v1` returns an index of the API: its name, version and
every endpoint below with who may call it. It is a quick way to check the API is up:

```bash
curl "$BASE"
```

```json
{
  "data": {
    "name": "Restaurant — Food Market API",
    "version": "v1",
    "documentation": "See the README, section \"Using the API\"",
    "endpoints": [
      { "method": "GET", "path": "/api/v1/restaurants", "access": "anyone" },
      { "method": "GET", "path": "/api/v1/restaurants/{id}", "access": "anyone" },
      "…and the other nine endpoints in the table below"
    ]
  }
}
```

Any other address under `/api/` that isn't listed here is `404` with the error envelope.

| Method and path                                           | Who                                                   | Does                              |
| --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
| [`GET /restaurants`](#list-restaurants)                   | anyone                                                | Lists restaurants                 |
| [`GET /restaurants/{id}`](#get-one-restaurant)            | anyone                                                | One restaurant                    |
| [`GET /restaurants/{id}/menu`](#list-a-restaurants-menu)  | anyone; that restaurant's staff also see hidden items | Lists a restaurant's menu         |
| [`POST /restaurants/{id}/menu`](#add-a-menu-item)         | staff of that restaurant                              | Adds a menu item                  |
| [`GET /menu-items/{id}`](#get-one-menu-item)              | anyone; a hidden item only to its own staff           | One menu item                     |
| [`PATCH /menu-items/{id}`](#change-a-menu-item)           | staff of its restaurant                               | Changes a menu item, or hides it  |
| [`POST /orders`](#place-an-order)                         | anyone                                                | Places an order                   |
| [`GET /orders`](#list-orders)                             | staff                                                 | Lists their restaurant's orders   |
| [`GET /orders/{id}`](#get-one-order)                      | staff of its restaurant, or the order's customer      | One order                         |
| [`PATCH /orders/{id}`](#move-an-order-to-its-next-status) | staff of its restaurant                               | Moves an order to its next status |
| [`DELETE /orders/{id}`](#cancel-an-order)                 | staff of its restaurant                               | Cancels an order                  |

There are no customer endpoints: a customer list would expose phone numbers.

### Restaurants

#### List restaurants

`GET /api/v1/restaurants` — anyone.

| Query parameter  | Type                            | Default | Notes                                                      |
| ---------------- | ------------------------------- | ------- | ---------------------------------------------------------- |
| `limit`          | whole number, 1–100             | `20`    | Larger values are clamped to 100                           |
| `offset`         | whole number, 0 or more         | `0`     |                                                            |
| `area`           | text                            | —       | Exact match, any case: `yaba` matches `Yaba`               |
| `cuisine`        | text                            | —       | Exact match, any case, e.g. `Nigerian`, `Grills`           |
| `minRating`      | number 0–5, one decimal place   | —       | e.g. `4` or `4.5`. Restaurants with no rating are left out |
| `maxDeliveryFee` | whole number, kobo              | —       | e.g. `100000` for ₦1,000 or less; `0` for free delivery    |
| `sort`           | `name`, `rating`, `deliveryFee` | `name`  | Restaurants with no rating always sort last                |
| `order`          | `asc`, `desc`                   | `asc`   |                                                            |

```bash
curl "$BASE/restaurants?area=yaba&sort=rating&order=desc&limit=2"
```

```json
{
  "data": [
    {
      "id": "cmulfzfjx01vpwjc4ecwcktv0",
      "name": "Yaba Continental",
      "area": "Yaba",
      "cuisine": "Continental",
      "rating": 4.6,
      "deliveryFee": 300000
    },
    {
      "id": "cmulfzfq302c9wjc4h6bf3uye",
      "name": "Yaba Pastries",
      "area": "Yaba",
      "cuisine": "Pastries",
      "rating": 4.5,
      "deliveryFee": 80000
    }
  ],
  "meta": { "total": 7, "limit": 2, "offset": 0, "hasMore": true }
}
```

`rating` is `null` when the restaurant has no rating yet. Errors: `400` for a bad parameter.

#### Get one restaurant

`GET /api/v1/restaurants/{id}` — anyone. No query parameters.

```bash
curl "$BASE/restaurants/cmulfzeru001dwjc45zpzkaj2"
```

```json
{
  "data": {
    "id": "cmulfzeru001dwjc45zpzkaj2",
    "name": "The Nigerian Place",
    "area": "Ilupeju",
    "cuisine": "Nigerian",
    "rating": 3.4,
    "deliveryFee": 0
  }
}
```

Errors: `400` for an id that isn't a cuid, `404` if there is no such restaurant.

### Menus

#### List a restaurant's menu

`GET /api/v1/restaurants/{id}/menu` — anyone. Customers only ever see items that are available;
the restaurant's own staff (with its staff key) also see hidden ones.

| Query parameter | Type                        | Default    | Notes                                                                      |
| --------------- | --------------------------- | ---------- | -------------------------------------------------------------------------- |
| `limit`         | whole number, 1–100         | `20`       | Larger values are clamped to 100                                           |
| `offset`        | whole number, 0 or more     | `0`        |                                                                            |
| `category`      | text                        | —          | Exact match, any case, e.g. `mains`, `Drinks`                              |
| `minPrice`      | whole number, kobo          | —          | Must not be greater than `maxPrice`                                        |
| `maxPrice`      | whole number, kobo          | —          |                                                                            |
| `available`     | `true`, `false`             | —          | Staff only: `false` lists hidden items. For anyone else `false` finds none |
| `sort`          | `category`, `name`, `price` | `category` | Sorting by category sorts by name within each category                     |
| `order`         | `asc`, `desc`               | `asc`      |                                                                            |

```bash
curl "$BASE/restaurants/cmulfzeru001dwjc45zpzkaj2/menu?category=mains&sort=price&order=desc&limit=2"
```

```json
{
  "data": [
    {
      "id": "cmulfzeru001fwjc4sk260ifc",
      "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
      "name": "Pounded yam & egusi",
      "category": "Mains",
      "price": 515000,
      "available": true
    },
    {
      "id": "cmulfzeru001ewjc423lvogtx",
      "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
      "name": "Efo riro & fufu",
      "category": "Mains",
      "price": 430000,
      "available": true
    }
  ],
  "meta": { "total": 2, "limit": 2, "offset": 0, "hasMore": false }
}
```

As staff, listing hidden items:

```bash
curl -H "Authorization: Bearer $STAFF_KEY" \
  "$BASE/restaurants/cmulfzeru001dwjc45zpzkaj2/menu?available=false&limit=2"
```

```json
{
  "data": [
    {
      "id": "cmulfzeru001mwjc4go7vu6ci",
      "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
      "name": "Chapman",
      "category": "Drinks",
      "price": 180000,
      "available": false
    },
    {
      "id": "cmulfzeru001gwjc4dxiccs3r",
      "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
      "name": "Banga soup & starch",
      "category": "Mains",
      "price": 795000,
      "available": false
    }
  ],
  "meta": { "total": 3, "limit": 2, "offset": 0, "hasMore": true }
}
```

Errors: `400` for a bad id or parameter, `401` for an invalid key, `404` if there is no such
restaurant.

#### Add a menu item

`POST /api/v1/restaurants/{id}/menu` — staff of that restaurant. The new item starts available.

| Body field | Type                    | Required | Notes                                       |
| ---------- | ----------------------- | -------- | ------------------------------------------- |
| `name`     | text, not blank         | yes      | e.g. `Pepper soup (goat)`                   |
| `category` | text, not blank         | yes      | The restaurant's own grouping, e.g. `Mains` |
| `price`    | whole number, kobo, ≥ 1 | yes      | e.g. `450000` for ₦4,500                    |

Any other field (such as `restaurantId` or `available`) is ignored.

```bash
curl -X POST "$BASE/restaurants/cmulfzeru001dwjc45zpzkaj2/menu" \
  -H "Authorization: Bearer $STAFF_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Pepper soup (goat)", "category": "Mains", "price": 450000}'
```

`201 Created`:

```json
{
  "data": {
    "id": "cmulfzpvm0002wjz0wzkev89m",
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "name": "Pepper soup (goat)",
    "category": "Mains",
    "price": 450000,
    "available": true
  }
}
```

Errors: `401` without a valid staff key, `403` for another restaurant's menu
(`"Staff can only change their own restaurant's menu"`), `400` for a bad id or a body that
isn't JSON, `422` for a missing or invalid field (e.g. `"price: Required"`).

#### Get one menu item

`GET /api/v1/menu-items/{id}` — anyone. A hidden item is visible only to its restaurant's staff;
to anyone else it is `404`. No query parameters.

```bash
curl "$BASE/menu-items/cmulfzpvm0002wjz0wzkev89m"
```

```json
{
  "data": {
    "id": "cmulfzpvm0002wjz0wzkev89m",
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "name": "Pepper soup (goat)",
    "category": "Mains",
    "price": 450000,
    "available": true
  }
}
```

Errors: `400` for an id that isn't a cuid, `401` for an invalid key, `404` if there is no such
item or it is hidden from you.

#### Change a menu item

`PATCH /api/v1/menu-items/{id}` — staff of its restaurant. Send only the fields to change; at
least one is required. **Menu items are never deleted**: set `available` to `false` to take one
off the menu. A new price applies to new orders only; past orders keep the price they were
charged.

| Body field  | Type                    | Notes                                 |
| ----------- | ----------------------- | ------------------------------------- |
| `name`      | text, not blank         |                                       |
| `category`  | text, not blank         |                                       |
| `price`     | whole number, kobo, ≥ 1 |                                       |
| `available` | `true` or `false`       | `false` hides the item from customers |

```bash
curl -X PATCH "$BASE/menu-items/cmulfzpvm0002wjz0wzkev89m" \
  -H "Authorization: Bearer $STAFF_KEY" \
  -H "Content-Type: application/json" \
  -d '{"price": 480000}'
```

```json
{
  "data": {
    "id": "cmulfzpvm0002wjz0wzkev89m",
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "name": "Pepper soup (goat)",
    "category": "Mains",
    "price": 480000,
    "available": true
  }
}
```

Errors: `401` without a valid staff key, `400` for a bad id or a body that isn't JSON, `422` for
an empty change or an invalid field, `404` if the item doesn't exist or belongs to another
restaurant. `DELETE` on a menu item is `405`.

### Orders

#### Place an order

`POST /api/v1/orders` — anyone. An order comes from **one restaurant**, and every item must be on
its menu and available.

| Body field           | Type                    | Required | Notes                                                                    |
| -------------------- | ----------------------- | -------- | ------------------------------------------------------------------------ |
| `restaurantId`       | cuid                    | yes      |                                                                          |
| `customer.name`      | text, not blank         | yes      |                                                                          |
| `customer.phone`     | text                    | yes      | `+234` followed by 10 digits, e.g. `+2348031234567`. `0803…` is rejected |
| `customer.area`      | text, not blank         | yes      | Where to deliver, e.g. `Yaba`                                            |
| `items`              | array, at least 1       | yes      | Each menu item at most once; combine quantities instead                  |
| `items[].menuItemId` | cuid                    | yes      |                                                                          |
| `items[].quantity`   | whole number, 1 or more | yes      |                                                                          |

**Don't send prices or a total**; they are ignored. The API copies each item's current price into
the order as `unitPrice` and computes `total` = Σ(`unitPrice` × `quantity`) + the restaurant's
delivery fee.

```bash
curl -X POST "$BASE/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "customer": { "name": "Ada Obi", "phone": "+2348031234567", "area": "Yaba" },
    "items": [
      { "menuItemId": "cmulfzpvm0002wjz0wzkev89m", "quantity": 2 },
      { "menuItemId": "cmulfzeru001fwjc4sk260ifc", "quantity": 1 }
    ]
  }'
```

`201 Created` (2 × ₦4,800 + 1 × ₦5,150 + ₦0 delivery = ₦14,750):

```json
{
  "data": {
    "id": "cmulfzpxl0005wjz0od7rfw2a",
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "status": "PENDING",
    "total": 1475000,
    "createdAt": "2026-09-28T16:08:50.697Z",
    "items": [
      { "menuItemId": "cmulfzpvm0002wjz0wzkev89m", "quantity": 2, "unitPrice": 480000 },
      { "menuItemId": "cmulfzeru001fwjc4sk260ifc", "quantity": 1, "unitPrice": 515000 }
    ],
    "trackingToken": "otk_EXAMPLEexampleEXAMPLEexampleEXAMPLEexampleE"
  }
}
```

**Save `trackingToken` now.** It is the customer's only way to check on the order and is never
shown again. The response never contains the customer's details.

Errors:

- `400` for a body that isn't JSON; `422 VALIDATION_ERROR` for a missing or invalid field
  (e.g. `"customer.phone: Required"`).
- `404` if the restaurant doesn't exist.
- `422` when the order breaks a rule; `code` says which and `message` names the item:
  `ITEM_NOT_FOUND`, `ITEM_FROM_OTHER_RESTAURANT`, `ITEM_UNAVAILABLE`, `DUPLICATE_ITEM`,
  `INVALID_QUANTITY` or `TOTAL_TOO_LARGE`. For example:

  ```json
  {
    "error": {
      "code": "DUPLICATE_ITEM",
      "message": "Menu item cmulfzeru001fwjc4sk260ifc is listed more than once; combine the quantities"
    }
  }
  ```

#### List orders

`GET /api/v1/orders` — staff. Lists **their own restaurant's** orders only.

| Query parameter | Type                             | Default     | Notes                                                 |
| --------------- | -------------------------------- | ----------- | ----------------------------------------------------- |
| `limit`         | whole number, 1–100              | `20`        | Larger values are clamped to 100                      |
| `offset`        | whole number, 0 or more          | `0`         |                                                       |
| `status`        | an [order status](#order-status) | —           | e.g. `PENDING` to see new orders                      |
| `from`          | ISO 8601 date or date-time       | —           | Orders placed at or after, e.g. `2026-09-01`          |
| `to`            | ISO 8601 date or date-time       | —           | Orders placed at or before. Must not be before `from` |
| `sort`          | `createdAt`, `total`             | `createdAt` |                                                       |
| `order`         | `asc`, `desc`                    | `desc`      | Newest first by default                               |

```bash
curl -H "Authorization: Bearer $STAFF_KEY" "$BASE/orders?status=PENDING&limit=2"
```

```json
{
  "data": [
    {
      "id": "cmulfzpxl0005wjz0od7rfw2a",
      "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
      "status": "PENDING",
      "total": 1475000,
      "createdAt": "2026-09-28T16:08:50.697Z",
      "customer": { "name": "Ada Obi", "area": "Yaba", "phone": "+2348031234567" },
      "items": [
        {
          "menuItemId": "cmulfzpvm0002wjz0wzkev89m",
          "name": "Pepper soup (goat)",
          "quantity": 2,
          "unitPrice": 480000
        },
        {
          "menuItemId": "cmulfzeru001fwjc4sk260ifc",
          "name": "Pounded yam & egusi",
          "quantity": 1,
          "unitPrice": 515000
        }
      ]
    }
  ],
  "meta": { "total": 1, "limit": 2, "offset": 0, "hasMore": false }
}
```

`customer.phone` is shown only while the order is active; once it is `DELIVERED` or `CANCELLED`
it is `null`. Errors: `401` without a valid staff key, `400` for a bad parameter.

#### Get one order

`GET /api/v1/orders/{id}` — the restaurant's staff, or the customer with the order's tracking
token. No query parameters.

As staff, the order includes the customer (same shape as in [List orders](#list-orders)):

```bash
curl -H "Authorization: Bearer $STAFF_KEY" "$BASE/orders/cmulfzpxl0005wjz0od7rfw2a"
```

As the customer, the same order without any customer details:

```bash
curl -H "Authorization: Bearer $TRACKING_TOKEN" "$BASE/orders/cmulfzpxl0005wjz0od7rfw2a"
```

```json
{
  "data": {
    "id": "cmulfzpxl0005wjz0od7rfw2a",
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "status": "PENDING",
    "total": 1475000,
    "createdAt": "2026-09-28T16:08:50.697Z",
    "items": [
      {
        "menuItemId": "cmulfzpvm0002wjz0wzkev89m",
        "name": "Pepper soup (goat)",
        "quantity": 2,
        "unitPrice": 480000
      },
      {
        "menuItemId": "cmulfzeru001fwjc4sk260ifc",
        "name": "Pounded yam & egusi",
        "quantity": 1,
        "unitPrice": 515000
      }
    ]
  }
}
```

Errors: `401` with no key at all, `400` for an id that isn't a cuid, `404` if the order doesn't
exist, belongs to another restaurant, or doesn't match the tracking token. All three look the
same on purpose.

#### Move an order to its next status

`PATCH /api/v1/orders/{id}` — staff of its restaurant. **Only `status` can change**, and only one
step forward (see [Order status](#order-status)). Any other field in the body is `422`.

| Body field | Type                             | Required |
| ---------- | -------------------------------- | -------- |
| `status`   | an [order status](#order-status) | yes      |

```bash
curl -X PATCH "$BASE/orders/cmulfzpxl0005wjz0od7rfw2a" \
  -H "Authorization: Bearer $STAFF_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "CONFIRMED"}'
```

Returns the updated order, as staff see it:

```json
{
  "data": {
    "id": "cmulfzpxl0005wjz0od7rfw2a",
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "status": "CONFIRMED",
    "total": 1475000,
    "createdAt": "2026-09-28T16:08:50.697Z",
    "customer": { "name": "Ada Obi", "area": "Yaba", "phone": "+2348031234567" },
    "items": [
      {
        "menuItemId": "cmulfzpvm0002wjz0wzkev89m",
        "name": "Pepper soup (goat)",
        "quantity": 2,
        "unitPrice": 480000
      },
      {
        "menuItemId": "cmulfzeru001fwjc4sk260ifc",
        "name": "Pounded yam & egusi",
        "quantity": 1,
        "unitPrice": 515000
      }
    ]
  }
}
```

Errors: `401` without a valid staff key, `400` for a bad id or a body that isn't JSON, `422` for
a missing or unknown status or an extra field, `404` for an order that isn't theirs, and `409`
when the move isn't allowed or someone else changed the order first:

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "An order can't go from CONFIRMED to DELIVERED"
  }
}
```

#### Cancel an order

`DELETE /api/v1/orders/{id}` — staff of its restaurant. **Cancels** the order: it is kept, with
status `CANCELLED`, so what the customer ordered and paid is never lost. Allowed from `PENDING`,
`CONFIRMED` or `PREPARING`. No body.

```bash
curl -X DELETE -H "Authorization: Bearer $STAFF_KEY" "$BASE/orders/cmulfzpxl0005wjz0od7rfw2a"
```

Returns the cancelled order. The customer's phone is now `null`:

```json
{
  "data": {
    "id": "cmulfzpxl0005wjz0od7rfw2a",
    "restaurantId": "cmulfzeru001dwjc45zpzkaj2",
    "status": "CANCELLED",
    "total": 1475000,
    "createdAt": "2026-09-28T16:08:50.697Z",
    "customer": { "name": "Ada Obi", "area": "Yaba", "phone": null },
    "items": [
      {
        "menuItemId": "cmulfzpvm0002wjz0wzkev89m",
        "name": "Pepper soup (goat)",
        "quantity": 2,
        "unitPrice": 480000
      },
      {
        "menuItemId": "cmulfzeru001fwjc4sk260ifc",
        "name": "Pounded yam & egusi",
        "quantity": 1,
        "unitPrice": 515000
      }
    ]
  }
}
```

Errors: `401` without a valid staff key, `400` for a bad id, `404` for an order that isn't
theirs, and `409` once the order is out for delivery or already finished:

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "The order is already CANCELLED and can't change"
  }
}
```

### Order status

`status` is one of a fixed list:

```
PENDING → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
    └──────────┴──────────┴──────► CANCELLED
```

An order moves forward one step at a time. It can't skip a step or go backwards. It can be
cancelled from `PENDING`, `CONFIRMED` or `PREPARING`; once it is `OUT_FOR_DELIVERY` it can only
become `DELIVERED`. `DELIVERED` and `CANCELLED` are final.

## Design decisions

### Why these resources

The API models what actually happens in a food market, and nothing more: **restaurants** publish
**menu items**; a **customer** places an **order** with one restaurant; each **order item** says
which menu item, how many, and at what price. Five resources are the fewest that can record an
order faithfully.

- **OrderItem is its own resource**, not a list of ids inside Order, because the pairing has
  facts of its own: `quantity` and `unitPrice`. `unitPrice` is copied from the menu at the moment
  of ordering, so when a restaurant raises a price next week, last week's orders still show what
  the customer actually paid.
- **Customer has no endpoints.** It exists so orders can be tied to a person, but a customer list
  would hand out phone numbers. Customers are only ever reached through a restaurant's own
  orders.
- **Not modelled yet**, on purpose: accounts, payments, reviews and delivery tracking. Each would
  add a resource, and none is needed to take and fulfil an order. See
  [What's in this repository](#whats-in-this-repository).

### Why generated identifiers

Every id is a **generated cuid** (e.g. `cmulfzeru001dwjc45zpzkaj2`), never an auto-incrementing
integer.

- **Counting numbers can be enumerated.** Anyone who sees `/orders/57` can try `/orders/58`,
  `/orders/59` and so on. That reveals how many orders exist, how fast the business is growing,
  and invites walking the whole dataset. A cuid can't be guessed from another one.
- **The server generates them**, never the client, so ids can't collide or be chosen by an
  attacker.
- **An id in any other shape is rejected with `400`** before the database is touched.

An unguessable id is not a key, though: knowing an order's id never grants access to it. That
takes a staff key or the order's tracking token.

### Why offset pagination, not cursors

Lists use `limit` and `offset`, and report `total` and `hasMore`.

- **Sorting by any field is simple and reliable.** Lists can be sorted by rating, price or total,
  and ratings can be empty. Cursor pagination over sortable, nullable fields is intricate and
  easy to get subtly wrong; offset pagination is exact for any sort.
- **Clients get a total and can jump to any page** ("page 3 of 12"), which cursors can't offer.
- **The cost is accepted:** if a row is added while someone is paging, later pages can shift by
  one. At this data size, with the id breaking every tie, that is rare and harmless.

The restaurant list briefly used cursors; it moved to offsets when every list gained sorting and
filtering. If one list grows very large (tens of thousands of rows browsed deep into), a cursor
can be added to that list alone in a future version.

### The envelope, and why

Success is always `{ "data": … }`, plus `"meta"` for lists. Every error is always
`{ "error": { "code", "message" } }`.

- **A client can tell success from failure by shape alone**, the same way on every endpoint:
  look for `data` or `error`. There are no per-endpoint special cases.
- **Lists have somewhere to put paging information** (`meta`) without mixing it into the items.
- **Room to grow.** New top-level keys can be added later without breaking anything that reads
  `data`.
- **`code` is for programs, `message` for people.** Clients branch on a stable `code`
  (`ITEM_UNAVAILABLE`, `RATE_LIMITED`) and can show `message`, which names the field or item at
  fault. Messages describe only what the caller sent; server details stay in the server log.
- **The HTTP status is honest too**, so generic tools and proxies see the right thing: `400` for a
  malformed request, `422` for a well-formed one that breaks a rule, `404`, `409`, `429` and so on.

### Other decisions

- **Money is whole kobo, as integers.** Floating-point numbers can't hold amounts like 0.1
  exactly, so totals slowly drift. Integers add up exactly. Clients convert to naira only when
  displaying.
- **Versioned from the first release (`/api/v1/`).** A later, incompatible change ships as
  `/api/v2/` while `/api/v1/` keeps working for existing clients.
- **The server computes every price and total.** A client can't pay less by sending a lower
  price; any price or total in a request is ignored.
- **Nothing a customer paid for is ever deleted.** Menu items are hidden, and `DELETE` on an order
  cancels it.

## Data design

### Resources and how they relate

| Resource   | Key fields                                             | Relationship                                                     |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Restaurant | id, name, area, cuisine, rating, deliveryFee           | has many MenuItems, has many Orders                              |
| MenuItem   | id, restaurantId, name, category, price, available     | belongs to a Restaurant                                          |
| Customer   | id, name, phone, area                                  | places many Orders                                               |
| Order      | id, customerId, restaurantId, status, total, createdAt | belongs to a Customer and a Restaurant, contains many OrderItems |
| OrderItem  | id, orderId, menuItemId, quantity, unitPrice           | links an Order to a MenuItem                                     |

#### The one-page diagram

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

### Fields

Every field is **required** unless marked optional. Types are the Prisma types the schema uses.

#### Restaurant

| Field        | Type      | Required | Notes                                                                                                                                        |
| ------------ | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| id           | `String`  | yes      | Generated cuid — see [Why generated identifiers](#why-generated-identifiers)                                                                 |
| name         | `String`  | yes      |                                                                                                                                              |
| area         | `String`  | yes      | Neighbourhood served, e.g. "Yaba", "Lekki Phase 1"                                                                                           |
| cuisine      | `String`  | yes      | e.g. "Nigerian", "Chinese", "Grills"                                                                                                         |
| rating       | `Decimal` | optional | 0.0–5.0, one decimal place. Typed in by hand — see [Rating](#rating)                                                                         |
| deliveryFee  | `Int`     | yes      | **Kobo.** ₦1,500 is stored as `150000`. `0` means free delivery                                                                              |
| staffKeyHash | `String`  | optional | Unique. SHA-256 hash of the restaurant's staff key — see [Restaurant staff access](#restaurant-staff-access). Never returned by any endpoint |

#### MenuItem

| Field        | Type      | Required | Notes                                                                     |
| ------------ | --------- | -------- | ------------------------------------------------------------------------- |
| id           | `String`  | yes      | Generated cuid                                                            |
| restaurantId | `String`  | yes      | → Restaurant.id                                                           |
| name         | `String`  | yes      | e.g. "Jollof rice & chicken"                                              |
| category     | `String`  | yes      | The restaurant's own grouping, e.g. "Mains", "Drinks"                     |
| price        | `Int`     | yes      | **Kobo.** Must be greater than 0                                          |
| available    | `Boolean` | yes      | Defaults to `true`. Set to `false` to hide an item instead of deleting it |

#### Customer

| Field | Type     | Required | Notes                                |
| ----- | -------- | -------- | ------------------------------------ |
| id    | `String` | yes      | Generated cuid                       |
| name  | `String` | yes      |                                      |
| phone | `String` | yes      | **Unique.** Stored in `+234…` format |
| area  | `String` | yes      | Where the customer usually orders to |

#### Order

| Field             | Type          | Required | Notes                                                                                                                                                     |
| ----------------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                | `String`      | yes      | Generated cuid                                                                                                                                            |
| customerId        | `String`      | yes      | → Customer.id                                                                                                                                             |
| restaurantId      | `String`      | yes      | → Restaurant.id                                                                                                                                           |
| status            | `OrderStatus` | yes      | Enum, defaults to `PENDING` — see [Order status](#order-status)                                                                                           |
| total             | `Int`         | yes      | **Kobo.** Worked out on the server, never sent by the client                                                                                              |
| createdAt         | `DateTime`    | yes      | Set by the database when the row is created                                                                                                               |
| trackingTokenHash | `String`      | optional | SHA-256 hash of the order's tracking token — see [Tracking an order](#tracking-an-order). Never returned. Empty for orders placed before tracking existed |

#### OrderItem

| Field      | Type     | Required | Notes                                                          |
| ---------- | -------- | -------- | -------------------------------------------------------------- |
| id         | `String` | yes      | Generated cuid                                                 |
| orderId    | `String` | yes      | → Order.id                                                     |
| menuItemId | `String` | yes      | → MenuItem.id                                                  |
| quantity   | `Int`    | yes      | 1 or more                                                      |
| unitPrice  | `Int`    | yes      | **Kobo.** A copy of `MenuItem.price` at the moment of ordering |

#### Operational tables

Tables the API needs to run that are **not** part of the food market: they belong to no resource,
point at nothing, and nothing points at them, so they don't appear on the diagram.

##### RateLimitWindow

One row per client address currently being rate-limited — see
[How rate limiting works](#how-rate-limiting-works).

| Field       | Type       | Required | Notes                                                       |
| ----------- | ---------- | -------- | ----------------------------------------------------------- |
| id          | `String`   | yes      | Generated cuid, like every other table                      |
| key         | `String`   | yes      | **Unique.** The client address the budget belongs to        |
| windowStart | `DateTime` | yes      | When this address's current window began                    |
| count       | `Int`      | yes      | Requests made in the current window, including refused ones |

Rows for finished windows are deleted regularly, so the table only ever holds addresses seen in
the last few minutes. Client addresses are kept no longer than that.

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

**What staff can do** is marked "staff" in the [Endpoints](#endpoints) table. On top of that:

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

### How rate limiting works

Most of the API needs no key, so each client address gets a request budget: by default **100
requests per minute**, across every `/api/` path, staff and customers alike. The limit runs
before any route, in `apps/api/src/proxy.ts`.

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
  src/config/        Settings kept out of handlers (rate limiting)
  src/proxy.ts       Runs before every /api request (rate limiting)
packages/db/         Prisma schema + migrations (the only copy of the schema)
packages/contracts/  Shared TypeScript types / zod schemas for every request and response
.agents/             Rules and skills the coding agent follows
```

**Stack:** Next.js, TypeScript (strict), Prisma, PostgreSQL, Node.js 22 LTS.

**Not in scope yet:** sign-in or accounts, payments, a mobile app, delivery tracking.

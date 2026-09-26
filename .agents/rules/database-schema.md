---
trigger: glob
---

# Database Schema Rules

Scope: how you interact with the data layer. The design in `README.md` ("Fields") is the
source of truth. Do not restate it here; read it there.

## Hard rules — breaking any of these fails the task even if it runs

- **Access the database through Prisma only.** No second ORM, no raw driver layer.
- **Every `id` is `String @id @default(cuid())`.** Never `Int @id @default(autoincrement())`.
- **Money columns are `Int` in kobo:** `Restaurant.deliveryFee`, `MenuItem.price`,
  `OrderItem.unitPrice`, `Order.total`. Never `Float` or `Decimal`.
- **`Order.status` is the `OrderStatus` enum**, defaulting to `PENDING`. Never `String`.
- **`Customer.phone` is unique at the database** (`@unique`), not just checked in code.
- **Foreign keys sit on the "belongs to" side** exactly as the README's diagram shows:
  `MenuItem.restaurantId`, `Order.customerId`, `Order.restaurantId`, `OrderItem.orderId`,
  `OrderItem.menuItemId`. Add an index for each.
- **A `MenuItem` referenced by an `OrderItem` can't be deleted** (`onDelete: Restrict`). Hide it
  with `available = false`.
- **`OrderItem.unitPrice` is written once, when the order is placed**, and never updated.

## Schema-change rules

- **The README changes first, then the schema.** Never add a field or model that isn't in the
  README's design.
- **Every schema change ships as a Prisma migration.** No hand-edited database, no drift.
- Destructive changes (dropping a column or table) need a human decision first.

## When unsure

If the schema seems to block a task, don't route around it. Surface the conflict.

---
name: prisma-migrations
description: Load before any change to the Prisma schema or any migration in packages/db. Triggers: schema.prisma, migration, migrate, new model, new field, enum change, index, relation.
---

# Prisma Migrations

Teaches the sequence for turning the README's data design into schema and migrations.

Laws live in: `database-schema.md`, `money.md`, `AGENTS.md` §2. The design is `README.md`.

## Procedure

1. Confirm the change is already in the README's "Fields" section. If it isn't, update the README
   and get it agreed first. Never add a field the design doesn't list.
2. Edit `packages/db/schema.prisma`:
   - `id String @id @default(cuid())` on every model.
   - Money as `Int` (kobo).
   - `status OrderStatus @default(PENDING)` with the enum declared once.
   - `@relation` on the "belongs to" side, plus `@@index` on each foreign key.
   - `onDelete: Restrict` from `OrderItem` to `MenuItem`.
3. Run `npx prisma migrate dev --create-only` and read the generated `migration.sql` before
   applying it.
4. Apply it, then regenerate the client.
5. Commit the schema change and its migration together, alone.

## Skeleton

```prisma
enum OrderStatus {
  PENDING
  CONFIRMED
  PREPARING
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
}

model OrderItem {
  id         String   @id @default(cuid())
  orderId    String
  menuItemId String
  quantity   Int
  unitPrice  Int      // kobo, copied from MenuItem.price when the order is placed
  order      Order    @relation(fields: [orderId], references: [id])
  menuItem   MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Restrict)

  @@index([orderId])
  @@index([menuItemId])
}
```

## Traps

- `Int @id @default(autoincrement())` — sequential IDs are banned.
- `Float` or `Decimal` for any money field.
- `status String` instead of the enum.
- Editing an already-applied migration. Create a new one.
- Running `migrate dev` without `--create-only` and applying SQL you haven't read.

## Verify before done

- [ ] The migration applies cleanly to a fresh database.
- [ ] Every model's `id` is a cuid; every money field is `Int`.
- [ ] Each foreign key has an index.
- [ ] Deleting a menu item used by an order fails.

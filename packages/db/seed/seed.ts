// Loads realistic development data: a few hundred rows per resource, generated with Faker.
//
// Repeatable: every run clears the five tables and reloads them in one transaction, so running
// it twice never duplicates anything, and a failed run leaves the previous data untouched.
// Faker is seeded, so names, menus and prices are the same on every run. Ids are still generated
// cuids, and order dates count back from now so the data always looks recent.
//
// Usage (from the repo root): npm run db:seed
// Against a remote database: npm run db:seed -- --confirm-wipe <database hostname>

import { fakerEN_NG as faker } from '@faker-js/faker';
import { OrderStatus, PrismaClient, type Prisma } from '@prisma/client';
// The same total rule the API uses, so seeded orders can never disagree with it.
import { computeOrderTotal } from '../../../apps/api/src/modules/orders/order-total';
import { AREAS, CUISINES, MENUS, type Category } from './vocabulary';

const FAKER_SEED = 20260926;
const RESTAURANTS = 200;
const CUSTOMERS = 500;
const ORDERS = 1200;

/** Whole naira in [min, max], rounded to ₦50, returned in kobo. */
function priceInKobo(minNaira: number, maxNaira: number): number {
  return faker.number.int({ min: minNaira / 50, max: maxNaira / 50 }) * 50 * 100;
}

function restaurantName(cuisine: string, area: string): string {
  return faker.helpers.arrayElement([
    () => `${faker.person.lastName()}'s Kitchen`,
    () => `Mama ${faker.person.firstName('female')}`,
    () => `Buka ${faker.person.lastName()}`,
    () => `${area} ${cuisine}`,
    () => `The ${cuisine} Place`,
    () => `${faker.person.firstName()}'s ${cuisine === 'Pastries' ? 'Bakery' : 'Eatery'}`,
  ])();
}

function menuFor(cuisine: string): Prisma.MenuItemCreateWithoutRestaurantInput[] {
  const categories: Category[] = MENUS[cuisine] ?? [];
  return categories.flatMap((category) =>
    faker.helpers
      .arrayElements(category.dishes, {
        min: Math.min(3, category.dishes.length),
        max: category.dishes.length,
      })
      .map((name) => ({
        name,
        category: category.name,
        price: priceInKobo(category.minNaira, category.maxNaira),
        // Most of a menu is on offer; a few items are hidden (README: hidden, not deleted).
        available: faker.datatype.boolean({ probability: 0.9 }),
      })),
  );
}

function uniquePhones(count: number): string[] {
  const phones = new Set<string>();
  while (phones.size < count) {
    const prefix = faker.helpers.arrayElement(['70', '80', '81', '90', '91']);
    phones.add(`+234${prefix}${faker.string.numeric(8)}`);
  }
  return [...phones];
}

/** Old orders are finished; only the last few hours hold orders still in progress. */
function statusAndDate(): { status: OrderStatus; createdAt: Date } {
  if (faker.datatype.boolean({ probability: 0.95 })) {
    return {
      createdAt: faker.date.recent({ days: 90 }),
      status: faker.helpers.weightedArrayElement([
        { weight: 88, value: OrderStatus.DELIVERED },
        { weight: 12, value: OrderStatus.CANCELLED },
      ]),
    };
  }
  return {
    createdAt: faker.date.recent({ days: 3 / 24 }),
    status: faker.helpers.weightedArrayElement([
      { weight: 25, value: OrderStatus.PENDING },
      { weight: 20, value: OrderStatus.CONFIRMED },
      { weight: 25, value: OrderStatus.PREPARING },
      { weight: 20, value: OrderStatus.OUT_FOR_DELIVERY },
      { weight: 10, value: OrderStatus.CANCELLED },
    ]),
  };
}

// The data is planned in memory first, then written with one bulk insert per table: about ten
// round trips instead of one per row, so seeding a remote database (e.g. Neon, far from here)
// takes seconds rather than timing out. Planning draws from Faker in the same order as before,
// so the data is the same.

type PlannedMenuItem = Prisma.MenuItemCreateWithoutRestaurantInput & { price: number };
type PlannedRestaurant = {
  row: { name: string; area: string; cuisine: string; rating: string | null; deliveryFee: number };
  menu: PlannedMenuItem[];
};
type PlannedOrder = {
  customerIndex: number;
  restaurantIndex: number;
  status: OrderStatus;
  createdAt: Date;
  total: number;
  lines: { menuIndex: number; quantity: number; unitPrice: number }[];
};

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed planning bug: missing ${what}`);
  return value;
}

function plan() {
  faker.seed(FAKER_SEED);

  const restaurants: PlannedRestaurant[] = [];
  for (let i = 0; i < RESTAURANTS; i++) {
    const cuisine = faker.helpers.arrayElement(CUISINES);
    const area = faker.helpers.arrayElement(AREAS);
    const name = restaurantName(cuisine, area);
    // Empty means "no rating yet", never a made-up number (README, Rating).
    const rating = faker.datatype.boolean({ probability: 0.8 })
      ? faker.number.float({ min: 2.5, max: 5, fractionDigits: 1 }).toFixed(1)
      : null;
    const deliveryFee = faker.datatype.boolean({ probability: 0.1 }) ? 0 : priceInKobo(500, 3000);
    const menu = menuFor(cuisine) as PlannedMenuItem[];
    restaurants.push({ row: { name, area, cuisine, rating, deliveryFee }, menu });
  }

  const customers = uniquePhones(CUSTOMERS).map((phone) => ({
    name: faker.person.fullName(),
    phone,
    area: faker.helpers.arrayElement(AREAS),
  }));

  const orders: PlannedOrder[] = [];
  for (let i = 0; i < ORDERS; i++) {
    const customer = faker.helpers.arrayElement(customers);
    // People mostly order from restaurants in their own area.
    const nearby = restaurants.filter((r) => r.row.area === customer.area);
    const restaurant = faker.helpers.arrayElement(
      nearby.length > 0 && faker.datatype.boolean({ probability: 0.7 }) ? nearby : restaurants,
    );
    const available = restaurant.menu.filter((item) => item.available);
    if (available.length === 0) continue;

    // Only available items from this one restaurant, at the menu's own price (rules A–C).
    const lines = faker.helpers
      .arrayElements(available, { min: 1, max: Math.min(4, available.length) })
      .map((item) => ({
        menuIndex: restaurant.menu.indexOf(item),
        unitPrice: item.price,
        quantity: faker.helpers.weightedArrayElement([
          { weight: 70, value: 1 },
          { weight: 20, value: 2 },
          { weight: 7, value: 3 },
          { weight: 3, value: 4 },
        ]),
      }));

    orders.push({
      customerIndex: customers.indexOf(customer),
      restaurantIndex: restaurants.indexOf(restaurant),
      ...statusAndDate(),
      total: computeOrderTotal(lines, restaurant.row.deliveryFee),
      lines,
    });
  }

  return { restaurants, customers, orders };
}

/**
 * Bulk inserts return their rows in insertion order in practice, but Postgres doesn't promise it.
 * Ids are matched to planned rows by position, so check it rather than risk linking an order to
 * the wrong menu item; a mismatch aborts the transaction and leaves the old data in place.
 */
function assertSameOrder(table: string, written: string[], planned: string[]): void {
  const at = written.findIndex((key, i) => key !== planned[i]);
  if (written.length !== planned.length || at !== -1) {
    throw new Error(`${table} came back in a different order (first difference at row ${at})`);
  }
}

async function seed(db: PrismaClient): Promise<void> {
  const { restaurants, customers, orders } = plan();

  await db.$transaction(
    async (tx) => {
      // Children first: OrderItem → MenuItem is RESTRICT, so the order matters.
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
      await tx.customer.deleteMany();
      await tx.menuItem.deleteMany();
      await tx.restaurant.deleteMany();

      const restaurantRows = await tx.restaurant.createManyAndReturn({
        data: restaurants.map((r) => r.row),
        select: { id: true, name: true, area: true },
      });
      assertSameOrder(
        'Restaurants',
        restaurantRows.map((r) => `${r.name}|${r.area}`),
        restaurants.map((r) => `${r.row.name}|${r.row.area}`),
      );

      const menuData = restaurants.flatMap((r, i) =>
        r.menu.map((item) => ({ ...item, restaurantId: must(restaurantRows[i], 'restaurant').id })),
      );
      const menuRows = await tx.menuItem.createManyAndReturn({
        data: menuData,
        select: { id: true, restaurantId: true, name: true },
      });
      assertSameOrder(
        'Menu items',
        menuRows.map((m) => `${m.restaurantId}|${m.name}`),
        menuData.map((m) => `${m.restaurantId}|${m.name}`),
      );
      // menuIds[restaurantIndex][menuIndex] → the menu item's database id.
      let next = 0;
      const menuIds = restaurants.map((r) =>
        r.menu.map(() => must(menuRows[next++], 'menu item').id),
      );

      const customerRows = await tx.customer.createManyAndReturn({
        data: customers,
        select: { id: true, phone: true },
      });
      const customerIdByPhone = new Map(customerRows.map((c) => [c.phone, c.id]));

      const orderData = orders.map((o) => ({
        customerId: must(
          customerIdByPhone.get(must(customers[o.customerIndex], 'customer').phone),
          'customer id',
        ),
        restaurantId: must(restaurantRows[o.restaurantIndex], 'restaurant').id,
        status: o.status,
        createdAt: o.createdAt,
        total: o.total,
      }));
      const orderRows = await tx.order.createManyAndReturn({
        data: orderData,
        select: { id: true, customerId: true, createdAt: true, total: true },
      });
      assertSameOrder(
        'Orders',
        orderRows.map((o) => `${o.customerId}|${o.createdAt.getTime()}|${o.total}`),
        orderData.map((o) => `${o.customerId}|${o.createdAt.getTime()}|${o.total}`),
      );

      await tx.orderItem.createMany({
        data: orders.flatMap((o, i) =>
          o.lines.map((line) => ({
            orderId: must(orderRows[i], 'order').id,
            menuItemId: must(menuIds[o.restaurantIndex]?.[line.menuIndex], 'menu item id'),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        ),
      });
    },
    { timeout: 120_000 },
  );
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * The seed clears every table, so it only runs against a local database unless the caller names
 * the remote one: `--confirm-wipe <hostname>`. Checking the target, not NODE_ENV, is what stops a
 * laptop with a production DATABASE_URL from wiping production by accident.
 */
function assertSafeToWipe(databaseUrl: string | undefined, argv: readonly string[]): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: this script clears every table. NODE_ENV is production.');
  }
  if (databaseUrl === undefined) throw new Error('Refusing to seed: DATABASE_URL is not set.');

  const host = new URL(databaseUrl).hostname;
  if (LOCAL_HOSTS.has(host)) return;

  const flag = argv.indexOf('--confirm-wipe');
  const confirmed = flag === -1 ? undefined : argv[flag + 1];
  if (confirmed !== host) {
    throw new Error(
      `Refusing to seed ${host}: this clears every table, including real orders and staff keys. ` +
        `If that is what you want, run again with --confirm-wipe ${host}`,
    );
  }
}

async function main(): Promise<void> {
  assertSafeToWipe(process.env.DATABASE_URL, process.argv.slice(2));

  const db = new PrismaClient();
  try {
    await seed(db);
    const [restaurants, menuItems, customers, orders, orderItems] = await Promise.all([
      db.restaurant.count(),
      db.menuItem.count(),
      db.customer.count(),
      db.order.count(),
      db.orderItem.count(),
    ]);
    console.log('Seeded:', { restaurants, menuItems, customers, orders, orderItems });
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});

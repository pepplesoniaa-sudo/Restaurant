// Issues a new staff key for one restaurant (README, Restaurant staff access).
//
// Prints the key once. Only its hash is stored, so it can't be shown again: running this a second
// time replaces the key, and the old one stops working at once.
//
// Usage (from the repo root): npm run staff-key -- <restaurantId>

import { PrismaClient } from '@prisma/client';
import { generateStaffKey, hashStaffKey } from '../../../apps/api/src/lib/staff-key';

async function main(): Promise<void> {
  const restaurantId = process.argv[2];
  if (restaurantId === undefined || process.argv.length > 3) {
    throw new Error('Usage: npm run staff-key -- <restaurantId>');
  }

  const db = new PrismaClient();
  try {
    const key = generateStaffKey();
    const updated = await db.restaurant.updateMany({
      where: { id: restaurantId },
      data: { staffKeyHash: hashStaffKey(key) },
    });
    if (updated.count === 0) throw new Error(`No restaurant with id ${restaurantId}`);

    const { name } = await db.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { name: true },
    });
    console.log(`New staff key for ${name} (${restaurantId}). Any previous key no longer works.`);
    console.log('Give it to the restaurant now; it will not be shown again:\n');
    console.log(key);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

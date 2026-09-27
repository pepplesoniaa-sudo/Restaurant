import { db } from '@/lib/db';
import { hashStaffKey, parseStaffKey } from '@/lib/staff-key';

export type Staff = { restaurantId: string };

/**
 * Who is calling, from their `Authorization` header (README, Restaurant staff access). The key
 * identifies the restaurant, so every staff action is limited to the restaurant returned here.
 * `null` means no valid key, whatever the reason; callers don't learn which.
 */
export async function authenticateStaff(authorization: string | null): Promise<Staff | null> {
  const key = parseStaffKey(authorization);
  if (key === null) return null;

  const restaurant = await db.restaurant.findUnique({
    where: { staffKeyHash: hashStaffKey(key) },
    select: { id: true },
  });
  return restaurant === null ? null : { restaurantId: restaurant.id };
}

export type OptionalStaff = { ok: true; staff: Staff | null } | { ok: false };

/**
 * For endpoints anyone may call but staff see more on. No header means an ordinary caller; a
 * header with a bad key is refused (`ok: false`), never quietly treated as no key.
 */
export async function authenticateOptionalStaff(
  authorization: string | null,
): Promise<OptionalStaff> {
  if (authorization === null) return { ok: true, staff: null };
  const staff = await authenticateStaff(authorization);
  return staff === null ? { ok: false } : { ok: true, staff };
}

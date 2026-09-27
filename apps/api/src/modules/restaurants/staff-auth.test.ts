import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStaffKey, hashStaffKey } from '@/lib/staff-key';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ db: { restaurant: { findUnique } } }));

const { authenticateStaff } = await import('./staff-auth');

const key = generateStaffKey();
const restaurantId = 'clx8k2j9d0000qz8h3v1f7a2b';

beforeEach(() => {
  findUnique.mockReset();
});

describe('authenticateStaff', () => {
  it("returns the key's restaurant", async () => {
    findUnique.mockResolvedValue({ id: restaurantId });

    expect(await authenticateStaff(`Bearer ${key}`)).toEqual({ restaurantId });
  });

  it('looks the key up by its hash, never the key itself', async () => {
    findUnique.mockResolvedValue({ id: restaurantId });

    await authenticateStaff(`Bearer ${key}`);

    expect(findUnique.mock.calls[0]?.[0].where).toEqual({ staffKeyHash: hashStaffKey(key) });
    expect(JSON.stringify(findUnique.mock.calls)).not.toContain(key);
  });

  it('rejects a key no restaurant has', async () => {
    findUnique.mockResolvedValue(null);

    expect(await authenticateStaff(`Bearer ${key}`)).toBeNull();
  });

  it.each([null, '', 'Bearer nonsense', `Basic ${key}`])(
    'rejects %j without touching the database',
    async (header) => {
      expect(await authenticateStaff(header)).toBeNull();
      expect(findUnique).not.toHaveBeenCalled();
    },
  );
});

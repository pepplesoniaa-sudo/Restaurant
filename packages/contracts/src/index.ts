import type { OrderStatus } from '@prisma/client';
import { z } from 'zod';

// Route params. Every id is a cuid (README, Identifiers); anything else is rejected before
// it reaches a module.
export const RestaurantIdParams = z.object({ restaurantId: z.cuid() });
export type RestaurantIdParams = z.infer<typeof RestaurantIdParams>;

/** The largest value a Postgres INTEGER column can hold. */
export const MAX_INT4 = 2_147_483_647;

// Placing an order (README, Access). Unknown keys such as `total`, `price` or `unitPrice` are
// stripped: money always comes from the database, never from the client.
export const PlaceOrderInput = z.object({
  restaurantId: z.cuid(),
  customer: z.object({
    name: z.string().trim().min(1),
    // +234 followed by 10 digits. Other formats are rejected, not converted.
    phone: z.string().regex(/^\+234\d{10}$/),
    area: z.string().trim().min(1),
  }),
  items: z
    .array(
      z.object({
        menuItemId: z.cuid(),
        quantity: z.number().int().min(1).max(MAX_INT4),
      }),
    )
    .min(1),
});
export type PlaceOrderInput = z.infer<typeof PlaceOrderInput>;

// Public response shapes. Money is whole kobo (README, Money is whole kobo).

export type RestaurantView = {
  id: string;
  name: string;
  area: string;
  cuisine: string;
  /** 0.0–5.0, one decimal place. `null` means no rating yet. */
  rating: number | null;
  /** Kobo. `0` means free delivery. */
  deliveryFee: number;
};

/** A menu item as shown to customers. Only available items are listed, so there's no flag. */
export type MenuItemView = {
  id: string;
  name: string;
  category: string;
  /** Kobo. */
  price: number;
};

/** The order just placed, returned only to the caller who placed it. No customer data. */
export type PlacedOrderView = {
  id: string;
  restaurantId: string;
  status: OrderStatus;
  /** Kobo, computed on the server. */
  total: number;
  createdAt: string;
  items: {
    menuItemId: string;
    quantity: number;
    /** Kobo, copied from the menu item's price when the order was placed. */
    unitPrice: number;
  }[];
};

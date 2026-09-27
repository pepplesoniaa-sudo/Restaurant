import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

// Route params. Every id is a cuid (README, Identifiers); anything else is rejected before
// it reaches a module.
export const RestaurantIdParams = z.object({ restaurantId: z.cuid() });
export type RestaurantIdParams = z.infer<typeof RestaurantIdParams>;

// Listing restaurants (README, Listing restaurants is paginated). Query-string values arrive as
// text, so `limit` is coerced; an empty or out-of-range limit is rejected, not clamped.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const pageQuery = {
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.cuid().optional(),
};

export type Page<T> = {
  items: T[];
  /** Pass back as `cursor` for the next page. `null` on the last page. */
  nextCursor: string | null;
};

export const RestaurantListQuery = z.object(pageQuery);
export type RestaurantListQuery = z.infer<typeof RestaurantListQuery>;

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

export type RestaurantPage = Page<RestaurantView>;

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

// Restaurant staff (README, Restaurant staff access). The restaurant always comes from the staff
// key, never from the request, so none of these carry a restaurantId.

export const OrderIdParams = z.object({ orderId: z.cuid() });
export const MenuItemIdParams = z.object({ menuItemId: z.cuid() });

export const StaffOrderListQuery = z.object({
  ...pageQuery,
  status: z.enum(OrderStatus).optional(),
});
export type StaffOrderListQuery = z.infer<typeof StaffOrderListQuery>;

export const OrderStatusInput = z.object({ status: z.enum(OrderStatus) });
export type OrderStatusInput = z.infer<typeof OrderStatusInput>;

const menuItemFields = {
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  /** Kobo, greater than 0. */
  price: z.number().int().min(1).max(MAX_INT4),
};

/** A new item always starts available (README, Restaurant staff access). */
export const MenuItemCreateInput = z.object(menuItemFields);
export type MenuItemCreateInput = z.infer<typeof MenuItemCreateInput>;

export const MenuItemUpdateInput = z
  .object({
    name: menuItemFields.name.optional(),
    category: menuItemFields.category.optional(),
    price: menuItemFields.price.optional(),
    available: z.boolean().optional(),
  })
  .refine((fields) => Object.values(fields).some((value) => value !== undefined), {
    message: 'Nothing to change',
  });
export type MenuItemUpdateInput = z.infer<typeof MenuItemUpdateInput>;

/** An order as its restaurant's staff see it. */
export type StaffOrderView = {
  id: string;
  status: OrderStatus;
  /** Kobo. */
  total: number;
  createdAt: string;
  customer: {
    name: string;
    area: string;
    /** Shown only while the order is active; `null` once it is DELIVERED or CANCELLED. */
    phone: string | null;
  };
  items: {
    menuItemId: string;
    name: string;
    quantity: number;
    /** Kobo, as charged on this order. */
    unitPrice: number;
  }[];
};

/** A menu item as its restaurant's staff see it: hidden items included. */
export type StaffMenuItemView = MenuItemView & { available: boolean };

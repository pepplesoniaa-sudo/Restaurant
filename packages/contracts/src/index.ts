import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

// The version 1 API contract (README, API). Every request is parsed with these schemas before it
// reaches a module, and every response has one of the envelope shapes at the bottom.

/** The largest value a Postgres INTEGER column can hold. */
export const MAX_INT4 = 2_147_483_647;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------------------------
// Route params. Every id is a cuid (README, Identifiers).

export const RestaurantIdParams = z.object({ restaurantId: z.cuid() });
export const MenuItemIdParams = z.object({ menuItemId: z.cuid() });
export const OrderIdParams = z.object({ orderId: z.cuid() });

// ---------------------------------------------------------------------------------------------
// Query strings. Values arrive as text and are parsed strictly: an empty, fractional or
// out-of-range number is rejected, never coerced to 0 or clamped (README, Lists).

function wholeNumber(min: number, max: number) {
  return z
    .string()
    .regex(/^\d+$/, 'Must be a whole number')
    .transform(Number)
    .pipe(z.number().min(min).max(max));
}

const text = z.string().trim().min(1).optional();
const kobo = wholeNumber(0, MAX_INT4).optional();
const sortOrder = z.enum(['asc', 'desc']);

const listQuery = {
  limit: wholeNumber(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: wholeNumber(0, MAX_INT4).default(0),
};

function notReversed(min: number | Date | undefined, max: number | Date | undefined): boolean {
  return min === undefined || max === undefined || min <= max;
}

export const RestaurantListQuery = z.object({
  ...listQuery,
  area: text,
  cuisine: text,
  minRating: z
    .string()
    .regex(/^\d(\.\d)?$/, 'Must be a rating like 4 or 4.5')
    .transform(Number)
    .pipe(z.number().min(0).max(5))
    .optional(),
  maxDeliveryFee: kobo,
  sort: z.enum(['name', 'rating', 'deliveryFee']).default('name'),
  order: sortOrder.default('asc'),
});
export type RestaurantListQuery = z.infer<typeof RestaurantListQuery>;

export const MenuListQuery = z
  .object({
    ...listQuery,
    category: text,
    minPrice: kobo,
    maxPrice: kobo,
    /** Only meaningful to the restaurant's own staff; everyone else only sees available items. */
    available: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    sort: z.enum(['category', 'name', 'price']).default('category'),
    order: sortOrder.default('asc'),
  })
  .refine((q) => notReversed(q.minPrice, q.maxPrice), {
    message: 'minPrice must not be greater than maxPrice',
    path: ['minPrice'],
  });
export type MenuListQuery = z.infer<typeof MenuListQuery>;

const dateTime = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) => new Date(value))
  .optional();

export const OrderListQuery = z
  .object({
    ...listQuery,
    status: z.enum(OrderStatus).optional(),
    from: dateTime,
    to: dateTime,
    sort: z.enum(['createdAt', 'total']).default('createdAt'),
    order: sortOrder.default('desc'),
  })
  .refine((q) => notReversed(q.from, q.to), {
    message: 'from must not be after to',
    path: ['from'],
  });
export type OrderListQuery = z.infer<typeof OrderListQuery>;

// ---------------------------------------------------------------------------------------------
// Request bodies. Unknown keys are stripped unless noted, so money sent by a client never
// reaches a module (rule A).

export const PlaceOrderInput = z.object({
  restaurantId: z.cuid(),
  customer: z.object({
    name: z.string().trim().min(1),
    // +234 followed by 10 digits. Other formats are rejected, not converted.
    phone: z.string().regex(/^\+234\d{10}$/, 'Must be +234 followed by 10 digits'),
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

/** Only `status` can change on an order; anything else in the body is an error, not ignored. */
export const OrderUpdateInput = z.strictObject({ status: z.enum(OrderStatus) });
export type OrderUpdateInput = z.infer<typeof OrderUpdateInput>;

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

// ---------------------------------------------------------------------------------------------
// Resources as the API returns them. Money is whole kobo (README, Money is whole kobo).

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

export type MenuItemView = {
  id: string;
  restaurantId: string;
  name: string;
  category: string;
  /** Kobo. */
  price: number;
  /** Always `true` for anyone but the restaurant's own staff, who also see hidden items. */
  available: boolean;
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
  /**
   * The only way for the customer to check on this order later (README, Tracking an order).
   * Returned once, here; only its hash is stored.
   */
  trackingToken: string;
};

/** An order as the customer who placed it sees it, by tracking token. No customer data. */
export type TrackedOrderView = Omit<OrderView, 'customer'>;

/** An order as its restaurant's own staff see it. */
export type OrderView = {
  id: string;
  restaurantId: string;
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

// ---------------------------------------------------------------------------------------------
// Envelopes (README, Responses). One shape for a resource, one for a list, one for every error.

export type DataEnvelope<T> = { data: T };

export type ListMeta = { total: number; limit: number; offset: number; hasMore: boolean };
export type ListEnvelope<T> = { data: T[]; meta: ListMeta };

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_TRANSITION'
  | 'STATUS_CHANGED'
  | 'NO_ITEMS'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_FROM_OTHER_RESTAURANT'
  | 'ITEM_UNAVAILABLE'
  | 'DUPLICATE_ITEM'
  | 'INVALID_QUANTITY'
  | 'TOTAL_TOO_LARGE'
  | 'INTERNAL_ERROR';

export type ErrorEnvelope = { error: { code: ErrorCode; message: string } };

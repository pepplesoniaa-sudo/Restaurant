import { OrderListQuery, PlaceOrderInput } from '@restaurant/contracts';
import {
  created,
  invalid,
  notFound,
  okList,
  queryOf,
  readJson,
  serverError,
  unauthorized,
  unprocessable,
} from '@/lib/http';
import { log } from '@/lib/log';
import { placeOrder } from '@/modules/orders/orders';
import { describeRejection } from '@/modules/orders/price-order';
import { listOrders } from '@/modules/orders/staff-orders';
import { authenticateStaff } from '@/modules/restaurants/staff-auth';

/** Staff only: their own restaurant's orders. */
export async function GET(req: Request): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const query = OrderListQuery.safeParse(queryOf(req));
    if (!query.success) return invalid(query.error);

    return okList(await listOrders(staff, query.data));
  } catch (err) {
    log.error('list orders failed', { err });
    return serverError();
  }
}

/** Anyone: places an order. */
export async function POST(req: Request): Promise<Response> {
  try {
    const input = PlaceOrderInput.safeParse(await readJson(req));
    if (!input.success) return invalid(input.error);

    const result = await placeOrder(input.data);
    if (result.ok) return created(result.order);
    if (result.rejection.reason === 'RESTAURANT_NOT_FOUND') {
      return notFound('Restaurant not found');
    }
    return unprocessable(result.rejection.reason, describeRejection(result.rejection));
  } catch (err) {
    log.error('place order failed', { err });
    return serverError();
  }
}

export {
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
} from '@/lib/http';

import { OrderIdParams, OrderUpdateInput } from '@restaurant/contracts';
import { conflict, invalid, notFound, ok, readJson, serverError, unauthorized } from '@/lib/http';
import { log } from '@/lib/log';
import { parseTrackingToken } from '@/lib/tracking-token';
import { isFinal } from '@/modules/orders/order-status';
import {
  cancelOrder,
  changeOrderStatus,
  getOrder,
  type ChangeStatusResult,
} from '@/modules/orders/staff-orders';
import { getTrackedOrder } from '@/modules/orders/tracking';
import { authenticateStaff } from '@/modules/restaurants/staff-auth';

// Staff reach their own restaurant's orders; another restaurant's order is a 404. A customer may
// also GET the one order their tracking token belongs to (README, Tracking an order), but can't
// change or cancel it.

type Ctx = RouteContext<'/api/v1/orders/[orderId]'>;

function statusResponse(result: ChangeStatusResult): Response {
  if (result.ok) return ok(result.order);
  switch (result.reason) {
    case 'NOT_FOUND':
      return notFound('Order not found');
    case 'INVALID_TRANSITION':
      return conflict(
        'INVALID_TRANSITION',
        isFinal(result.from)
          ? `The order is already ${result.from} and can't change`
          : `An order can't go from ${result.from} to ${result.to}`,
      );
    case 'STATUS_CHANGED':
      return conflict('STATUS_CHANGED', 'The order changed meanwhile; reload it and try again');
  }
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const authorization = req.headers.get('authorization');
    const trackingToken = parseTrackingToken(authorization);
    if (trackingToken !== null) {
      const params = OrderIdParams.safeParse(await ctx.params);
      if (!params.success) return invalid(params.error);

      const order = await getTrackedOrder(params.data.orderId, trackingToken);
      return order === null ? notFound('Order not found') : ok(order);
    }

    const staff = await authenticateStaff(authorization);
    if (staff === null) return unauthorized();

    const params = OrderIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);

    const order = await getOrder(staff, params.data.orderId);
    return order === null ? notFound('Order not found') : ok(order);
  } catch (err) {
    log.error('get order failed', { err });
    return serverError();
  }
}

/** Only `status` can change, one step at a time. */
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = OrderIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);
    const input = OrderUpdateInput.safeParse(await readJson(req));
    if (!input.success) return invalid(input.error);

    return statusResponse(await changeOrderStatus(staff, params.data.orderId, input.data.status));
  } catch (err) {
    log.error('update order failed', { err });
    return serverError();
  }
}

/** Cancels the order; the row is kept. */
export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = OrderIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);

    return statusResponse(await cancelOrder(staff, params.data.orderId));
  } catch (err) {
    log.error('cancel order failed', { err });
    return serverError();
  }
}

export { methodNotAllowed as POST, methodNotAllowed as PUT } from '@/lib/http';

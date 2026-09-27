import { OrderIdParams, OrderStatusInput } from '@restaurant/contracts';
import {
  badRequest,
  conflict,
  notFound,
  ok,
  readJson,
  serverError,
  unauthorized,
  unprocessable,
} from '@/lib/http';
import { log } from '@/lib/log';
import { changeOrderStatus } from '@/modules/orders/staff-orders';
import { authenticateStaff } from '@/modules/restaurants/staff-auth';

export async function PATCH(
  req: Request,
  ctx: RouteContext<'/api/staff/orders/[orderId]/status'>,
): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = OrderIdParams.safeParse(await ctx.params);
    const input = OrderStatusInput.safeParse(await readJson(req));
    if (!params.success || !input.success) return badRequest();

    const result = await changeOrderStatus(staff, params.data.orderId, input.data.status);
    if (result.ok) return ok(result.order);
    switch (result.reason) {
      case 'NOT_FOUND':
        return notFound();
      case 'INVALID_TRANSITION':
        return unprocessable({
          error: 'Status change not allowed',
          reason: result.reason,
          from: result.from,
          to: result.to,
        });
      case 'STATUS_CHANGED':
        return conflict({ error: 'Order status changed meanwhile; reload it and try again' });
    }
  } catch (err) {
    log.error('change order status failed', { err });
    return serverError();
  }
}

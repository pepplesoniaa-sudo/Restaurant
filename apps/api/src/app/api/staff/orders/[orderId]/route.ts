import { OrderIdParams } from '@restaurant/contracts';
import { badRequest, notFound, ok, serverError, unauthorized } from '@/lib/http';
import { log } from '@/lib/log';
import { getStaffOrder } from '@/modules/orders/staff-orders';
import { authenticateStaff } from '@/modules/restaurants/staff-auth';

export async function GET(
  req: Request,
  ctx: RouteContext<'/api/staff/orders/[orderId]'>,
): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = OrderIdParams.safeParse(await ctx.params);
    if (!params.success) return badRequest();

    const order = await getStaffOrder(staff, params.data.orderId);
    return order === null ? notFound() : ok(order);
  } catch (err) {
    log.error('get staff order failed', { err });
    return serverError();
  }
}

import { StaffOrderListQuery } from '@restaurant/contracts';
import { badRequest, ok, serverError, unauthorized } from '@/lib/http';
import { log } from '@/lib/log';
import { listStaffOrders } from '@/modules/orders/staff-orders';
import { authenticateStaff } from '@/modules/restaurants/staff-auth';

export async function GET(req: Request): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = new URL(req.url).searchParams;
    const query = StaffOrderListQuery.safeParse({
      limit: params.get('limit') ?? undefined,
      cursor: params.get('cursor') ?? undefined,
      status: params.get('status') ?? undefined,
    });
    if (!query.success) return badRequest();

    return ok(await listStaffOrders(staff, query.data));
  } catch (err) {
    log.error('list staff orders failed', { err });
    return serverError();
  }
}

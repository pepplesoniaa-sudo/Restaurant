import { MenuItemCreateInput, MenuListQuery, RestaurantIdParams } from '@restaurant/contracts';
import {
  created,
  forbidden,
  invalid,
  notFound,
  okList,
  queryOf,
  readBody,
  serverError,
  unauthorized,
} from '@/lib/http';
import { log } from '@/lib/log';
import { createMenuItem, listMenu } from '@/modules/menu-items/menu-items';
import { authenticateOptionalStaff, authenticateStaff } from '@/modules/restaurants/staff-auth';

type Ctx = RouteContext<'/api/v1/restaurants/[restaurantId]/menu'>;

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const auth = await authenticateOptionalStaff(req.headers.get('authorization'));
    if (!auth.ok) return unauthorized();

    const params = RestaurantIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);
    const query = MenuListQuery.safeParse(queryOf(req));
    if (!query.success) return invalid(query.error);

    const menu = await listMenu(params.data.restaurantId, query.data, auth.staff);
    return menu === null ? notFound('Restaurant not found') : okList(menu);
  } catch (err) {
    log.error('list menu failed', { err });
    return serverError();
  }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = RestaurantIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);
    const input = await readBody(req, MenuItemCreateInput);
    if (!input.ok) return input.response;

    const result = await createMenuItem(staff, params.data.restaurantId, input.data);
    return result.ok
      ? created(result.item)
      : forbidden("Staff can only change their own restaurant's menu");
  } catch (err) {
    log.error('create menu item failed', { err });
    return serverError();
  }
}

export {
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
} from '@/lib/http';

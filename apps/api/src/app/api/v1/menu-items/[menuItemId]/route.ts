import { MenuItemIdParams, MenuItemUpdateInput } from '@restaurant/contracts';
import { invalid, notFound, ok, readBody, serverError, unauthorized } from '@/lib/http';
import { log } from '@/lib/log';
import { getMenuItem, updateMenuItem } from '@/modules/menu-items/menu-items';
import { authenticateOptionalStaff, authenticateStaff } from '@/modules/restaurants/staff-auth';

type Ctx = RouteContext<'/api/v1/menu-items/[menuItemId]'>;

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const auth = await authenticateOptionalStaff(req.headers.get('authorization'));
    if (!auth.ok) return unauthorized();

    const params = MenuItemIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);

    const item = await getMenuItem(params.data.menuItemId, auth.staff);
    return item === null ? notFound('Menu item not found') : ok(item);
  } catch (err) {
    log.error('get menu item failed', { err });
    return serverError();
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = MenuItemIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);
    const input = await readBody(req, MenuItemUpdateInput);
    if (!input.ok) return input.response;

    const item = await updateMenuItem(staff, params.data.menuItemId, input.data);
    return item === null ? notFound('Menu item not found') : ok(item);
  } catch (err) {
    log.error('update menu item failed', { err });
    return serverError();
  }
}

export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as DELETE,
} from '@/lib/http';

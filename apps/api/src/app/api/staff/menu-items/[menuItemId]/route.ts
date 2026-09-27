import { MenuItemIdParams, MenuItemUpdateInput } from '@restaurant/contracts';
import { badRequest, notFound, ok, readJson, serverError, unauthorized } from '@/lib/http';
import { log } from '@/lib/log';
import { updateMenuItem } from '@/modules/menu-items/staff-menu-items';
import { authenticateStaff } from '@/modules/restaurants/staff-auth';

export async function PATCH(
  req: Request,
  ctx: RouteContext<'/api/staff/menu-items/[menuItemId]'>,
): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const params = MenuItemIdParams.safeParse(await ctx.params);
    const input = MenuItemUpdateInput.safeParse(await readJson(req));
    if (!params.success || !input.success) return badRequest();

    const item = await updateMenuItem(staff, params.data.menuItemId, input.data);
    return item === null ? notFound() : ok(item);
  } catch (err) {
    log.error('update menu item failed', { err });
    return serverError();
  }
}

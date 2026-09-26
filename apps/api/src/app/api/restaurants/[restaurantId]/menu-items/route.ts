import { RestaurantIdParams } from '@restaurant/contracts';
import { badRequest, notFound, ok, serverError } from '@/lib/http';
import { log } from '@/lib/log';
import { listAvailableMenuItems } from '@/modules/menu-items/menu-items';

export async function GET(
  _req: Request,
  ctx: RouteContext<'/api/restaurants/[restaurantId]/menu-items'>,
): Promise<Response> {
  try {
    const params = RestaurantIdParams.safeParse(await ctx.params);
    if (!params.success) return badRequest();

    const menuItems = await listAvailableMenuItems(params.data.restaurantId);
    return menuItems === null ? notFound() : ok(menuItems);
  } catch (err) {
    log.error('list menu items failed', { err });
    return serverError();
  }
}

import { RestaurantIdParams } from '@restaurant/contracts';
import { invalid, notFound, ok, serverError } from '@/lib/http';
import { log } from '@/lib/log';
import { getRestaurant } from '@/modules/restaurants/restaurants';

export async function GET(
  _req: Request,
  ctx: RouteContext<'/api/v1/restaurants/[restaurantId]'>,
): Promise<Response> {
  try {
    const params = RestaurantIdParams.safeParse(await ctx.params);
    if (!params.success) return invalid(params.error);

    const restaurant = await getRestaurant(params.data.restaurantId);
    return restaurant === null ? notFound('Restaurant not found') : ok(restaurant);
  } catch (err) {
    log.error('get restaurant failed', { err });
    return serverError();
  }
}

export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
} from '@/lib/http';

import { RestaurantIdParams } from '@restaurant/contracts';
import { badRequest, notFound, ok, serverError } from '@/lib/http';
import { log } from '@/lib/log';
import { getRestaurant } from '@/modules/restaurants/restaurants';

export async function GET(
  _req: Request,
  ctx: RouteContext<'/api/restaurants/[restaurantId]'>,
): Promise<Response> {
  try {
    const params = RestaurantIdParams.safeParse(await ctx.params);
    if (!params.success) return badRequest();

    const restaurant = await getRestaurant(params.data.restaurantId);
    return restaurant === null ? notFound() : ok(restaurant);
  } catch (err) {
    log.error('get restaurant failed', { err });
    return serverError();
  }
}

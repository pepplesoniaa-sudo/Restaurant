import { RestaurantListQuery } from '@restaurant/contracts';
import { badRequest, ok, serverError } from '@/lib/http';
import { log } from '@/lib/log';
import { listRestaurants } from '@/modules/restaurants/restaurants';

export async function GET(req: Request): Promise<Response> {
  try {
    const params = new URL(req.url).searchParams;
    const query = RestaurantListQuery.safeParse({
      limit: params.get('limit') ?? undefined,
      cursor: params.get('cursor') ?? undefined,
    });
    if (!query.success) return badRequest();

    return ok(await listRestaurants(query.data));
  } catch (err) {
    log.error('list restaurants failed', { err });
    return serverError();
  }
}

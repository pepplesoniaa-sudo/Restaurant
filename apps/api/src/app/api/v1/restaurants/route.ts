import { RestaurantListQuery } from '@restaurant/contracts';
import { invalid, okList, queryOf, serverError } from '@/lib/http';
import { log } from '@/lib/log';
import { listRestaurants } from '@/modules/restaurants/restaurants';

export async function GET(req: Request): Promise<Response> {
  try {
    const query = RestaurantListQuery.safeParse(queryOf(req));
    if (!query.success) return invalid(query.error);

    return okList(await listRestaurants(query.data));
  } catch (err) {
    log.error('list restaurants failed', { err });
    return serverError();
  }
}

export {
  methodNotAllowed as POST,
  methodNotAllowed as PUT,
  methodNotAllowed as PATCH,
  methodNotAllowed as DELETE,
} from '@/lib/http';

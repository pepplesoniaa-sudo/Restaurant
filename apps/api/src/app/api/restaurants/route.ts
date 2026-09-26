import { ok, serverError } from '@/lib/http';
import { log } from '@/lib/log';
import { listRestaurants } from '@/modules/restaurants/restaurants';

export async function GET(): Promise<Response> {
  try {
    return ok(await listRestaurants());
  } catch (err) {
    log.error('list restaurants failed', { err });
    return serverError();
  }
}

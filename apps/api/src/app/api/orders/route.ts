import { PlaceOrderInput } from '@restaurant/contracts';
import { badRequest, created, notFound, serverError, unprocessable } from '@/lib/http';
import { log } from '@/lib/log';
import { placeOrder } from '@/modules/orders/orders';

export async function POST(req: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Not JSON at all: the caller's mistake, nothing to log.
      return badRequest();
    }

    const input = PlaceOrderInput.safeParse(body);
    if (!input.success) return badRequest();

    const result = await placeOrder(input.data);
    if (result.ok) return created(result.order);
    if (result.rejection.reason === 'RESTAURANT_NOT_FOUND') return notFound();
    return unprocessable({ error: 'Order rejected', ...result.rejection });
  } catch (err) {
    log.error('place order failed', { err });
    return serverError();
  }
}

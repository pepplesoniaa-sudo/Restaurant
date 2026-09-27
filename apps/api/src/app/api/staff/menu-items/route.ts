import { MenuItemCreateInput } from '@restaurant/contracts';
import { badRequest, created, ok, readJson, serverError, unauthorized } from '@/lib/http';
import { log } from '@/lib/log';
import { createMenuItem, listStaffMenuItems } from '@/modules/menu-items/staff-menu-items';
import { authenticateStaff } from '@/modules/restaurants/staff-auth';

export async function GET(req: Request): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    return ok(await listStaffMenuItems(staff));
  } catch (err) {
    log.error('list staff menu items failed', { err });
    return serverError();
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const staff = await authenticateStaff(req.headers.get('authorization'));
    if (staff === null) return unauthorized();

    const input = MenuItemCreateInput.safeParse(await readJson(req));
    if (!input.success) return badRequest();

    return created(await createMenuItem(staff, input.data));
  } catch (err) {
    log.error('create menu item failed', { err });
    return serverError();
  }
}

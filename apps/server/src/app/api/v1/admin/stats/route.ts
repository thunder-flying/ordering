import { route } from "../../../../../lib/http/handler";
import { requireAdmin } from "../../../../../modules/admin/require-admin";
import { getAdminStats } from "../../../../../modules/admin/stats-service";

export const GET = route(async (request) => {
  await requireAdmin(request);
  return getAdminStats();
});

import { route } from "../../../../../lib/http/handler";
import { requireUser } from "../../../../../modules/auth/require-user";
import { revokeUserSession } from "../../../../../modules/auth/session-service";

export const DELETE = route(async (request) => {
  const { sessionId } = await requireUser(request);
  await revokeUserSession(sessionId);
  return { success: true as const };
});

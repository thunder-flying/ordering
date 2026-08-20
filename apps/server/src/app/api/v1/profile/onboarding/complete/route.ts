import { route } from "../../../../../../lib/http/handler";
import { requireUser } from "../../../../../../modules/auth/require-user";
import { completeOnboarding } from "../../../../../../modules/profile/profile-service";

export const POST = route(async (request) => {
  const { userId } = await requireUser(request);
  return completeOnboarding(userId);
});

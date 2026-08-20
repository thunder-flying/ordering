import { ClearPrivateDataInput } from "@ordering/contracts";

import { route } from "../../../../../lib/http/handler";
import { parseJson } from "../../../../../lib/http/json";
import { requireUser } from "../../../../../modules/auth/require-user";
import { clearPrivateData } from "../../../../../modules/profile/profile-service";

export const DELETE = route(async (request) => {
  const { userId } = await requireUser(request);
  await parseJson(request, ClearPrivateDataInput);
  return clearPrivateData(userId);
});

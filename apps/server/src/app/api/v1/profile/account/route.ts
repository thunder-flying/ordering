import { DeleteAccountInput } from "@ordering/contracts";

import { route } from "../../../../../lib/http/handler";
import { parseJson } from "../../../../../lib/http/json";
import { requireUser } from "../../../../../modules/auth/require-user";
import { deleteAccount } from "../../../../../modules/profile/profile-service";

export const DELETE = route(async (request) => {
  const { userId } = await requireUser(request);
  await parseJson(request, DeleteAccountInput);
  return deleteAccount(userId);
});

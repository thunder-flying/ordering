import { UpdateNicknameInput } from "@ordering/contracts";

import { route } from "../../../../lib/http/handler";
import { parseJson } from "../../../../lib/http/json";
import { requireUser } from "../../../../modules/auth/require-user";
import {
  getProfile,
  updateNickname,
} from "../../../../modules/profile/profile-service";

export const GET = route(async (request) => {
  const { userId } = await requireUser(request);
  return getProfile(userId);
});

export const PATCH = route(async (request) => {
  const { userId } = await requireUser(request);
  const input = await parseJson(request, UpdateNicknameInput);
  return updateNickname(userId, input.nickname);
});

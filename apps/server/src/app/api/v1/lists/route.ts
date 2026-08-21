import {
  SavedListSearch,
  SaveListInput,
} from "@ordering/contracts";

import { route } from "../../../../lib/http/handler";
import { parseJson, parseSearchParams } from "../../../../lib/http/json";
import { jsonSuccess } from "../../../../lib/http/response";
import { checkRateLimit } from "../../../../lib/security/rate-limit";
import { requireUser } from "../../../../modules/auth/require-user";
import { createList, listLists } from "../../../../modules/lists/list-service";

const CREATE_LIST_RATE_RULE = { limit: 30, windowMs: 60_000 };

export const GET = route(async (request) => {
  const { userId } = await requireUser(request);
  const input = parseSearchParams(request.nextUrl.searchParams, SavedListSearch);
  return listLists(userId, input);
});

export const POST = route(async (request) => {
  const { userId } = await requireUser(request);
  checkRateLimit(`create-list:${userId}`, CREATE_LIST_RATE_RULE);
  const input = await parseJson(request, SaveListInput);
  return jsonSuccess(await createList(userId, input), {
    status: 201,
  });
});

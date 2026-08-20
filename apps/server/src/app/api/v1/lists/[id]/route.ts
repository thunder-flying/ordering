import { ResourceId, UpdateListInput } from "@ordering/contracts";

import { ApiError } from "../../../../../lib/http/api-error";
import { route } from "../../../../../lib/http/handler";
import { parseJson } from "../../../../../lib/http/json";
import { requireUser } from "../../../../../modules/auth/require-user";
import {
  deleteList,
  getList,
  updateList,
} from "../../../../../modules/lists/list-service";

type ListRouteContext = {
  params: Promise<{ id: string }>;
};

async function listIdFrom(context: ListRouteContext): Promise<string> {
  const result = ResourceId.safeParse((await context.params).id);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "清单 ID 格式不正确", 400);
  }
  return result.data;
}

export const GET = route<ListRouteContext>(async (request, context) => {
  const { userId } = await requireUser(request);
  return getList(userId, await listIdFrom(context));
});

export const PATCH = route<ListRouteContext>(async (request, context) => {
  const { userId } = await requireUser(request);
  const listId = await listIdFrom(context);
  const input = await parseJson(request, UpdateListInput);
  return updateList(userId, listId, input);
});

export const DELETE = route<ListRouteContext>(async (request, context) => {
  const { userId } = await requireUser(request);
  return deleteList(userId, await listIdFrom(context));
});

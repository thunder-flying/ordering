import { CopyListInput, ResourceId, apiSuccess } from "@ordering/contracts";
import { NextResponse } from "next/server";

import { ApiError } from "../../../../../../lib/http/api-error";
import { route } from "../../../../../../lib/http/handler";
import { parseJson } from "../../../../../../lib/http/json";
import { requireUser } from "../../../../../../modules/auth/require-user";
import { copyList } from "../../../../../../modules/lists/list-service";

type CopyListRouteContext = {
  params: Promise<{ id: string }>;
};

async function listIdFrom(context: CopyListRouteContext): Promise<string> {
  const result = ResourceId.safeParse((await context.params).id);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "清单 ID 格式不正确", 400);
  }
  return result.data;
}

export const POST = route<CopyListRouteContext>(async (request, context) => {
  const { userId } = await requireUser(request);
  const listId = await listIdFrom(context);
  const input = await parseJson(request, CopyListInput);
  return NextResponse.json(apiSuccess(await copyList(userId, listId, input)), {
    status: 201,
  });
});

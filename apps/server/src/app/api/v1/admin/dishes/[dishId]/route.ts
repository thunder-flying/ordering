import {
  DishUpdateInput,
  OptimisticDeleteInput,
  ResourceId,
} from "@ordering/contracts";

import { ApiError } from "../../../../../../lib/http/api-error";
import { route } from "../../../../../../lib/http/handler";
import { parseJson } from "../../../../../../lib/http/json";
import { requireAdmin } from "../../../../../../modules/admin/require-admin";
import {
  softDeleteDish,
  updateDish,
} from "../../../../../../modules/menu/dish-service";

type DishRouteContext = {
  params: Promise<{ dishId: string }>;
};

async function dishIdFrom(context: DishRouteContext): Promise<string> {
  const result = ResourceId.safeParse((await context.params).dishId);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "菜品 ID 格式不正确", 400);
  }
  return result.data;
}

export const PATCH = route<DishRouteContext>(async (request, context) => {
  await requireAdmin(request);
  const dishId = await dishIdFrom(context);
  const input = await parseJson(request, DishUpdateInput);
  return updateDish(dishId, input);
});

export const DELETE = route<DishRouteContext>(async (request, context) => {
  await requireAdmin(request);
  const dishId = await dishIdFrom(context);
  const input = await parseJson(request, OptimisticDeleteInput);
  await softDeleteDish(dishId, input.expectedUpdatedAt);
  return { success: true as const };
});

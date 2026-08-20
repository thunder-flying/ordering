import {
  CategoryUpdateInput,
  OptimisticDeleteInput,
  ResourceId,
} from "@ordering/contracts";

import { ApiError } from "../../../../../../lib/http/api-error";
import { route } from "../../../../../../lib/http/handler";
import { parseJson } from "../../../../../../lib/http/json";
import { requireAdmin } from "../../../../../../modules/admin/require-admin";
import {
  softDeleteCategory,
  updateCategory,
} from "../../../../../../modules/menu/category-service";

type CategoryRouteContext = {
  params: Promise<{ categoryId: string }>;
};

async function categoryIdFrom(context: CategoryRouteContext): Promise<string> {
  const result = ResourceId.safeParse((await context.params).categoryId);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "分类 ID 格式不正确", 400);
  }
  return result.data;
}

export const PATCH = route<CategoryRouteContext>(async (request, context) => {
  await requireAdmin(request);
  const categoryId = await categoryIdFrom(context);
  const input = await parseJson(request, CategoryUpdateInput);
  return updateCategory(categoryId, input);
});

export const DELETE = route<CategoryRouteContext>(async (request, context) => {
  await requireAdmin(request);
  const categoryId = await categoryIdFrom(context);
  const input = await parseJson(request, OptimisticDeleteInput);
  await softDeleteCategory(categoryId, input.expectedUpdatedAt);
  return { success: true as const };
});

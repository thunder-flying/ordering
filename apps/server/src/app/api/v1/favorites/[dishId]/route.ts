import { ResourceId } from "@ordering/contracts";

import { ApiError } from "../../../../../lib/http/api-error";
import { route } from "../../../../../lib/http/handler";
import { requireUser } from "../../../../../modules/auth/require-user";
import {
  addFavorite,
  removeFavorite,
} from "../../../../../modules/favorites/favorite-service";

type FavoriteRouteContext = {
  params: Promise<{ dishId: string }>;
};

async function dishIdFrom(context: FavoriteRouteContext): Promise<string> {
  const result = ResourceId.safeParse((await context.params).dishId);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", "菜品 ID 格式不正确", 400);
  }
  return result.data;
}

export const PUT = route<FavoriteRouteContext>(async (request, context) => {
  const { userId } = await requireUser(request);
  return addFavorite(userId, await dishIdFrom(context));
});

export const DELETE = route<FavoriteRouteContext>(async (request, context) => {
  const { userId } = await requireUser(request);
  return removeFavorite(userId, await dishIdFrom(context));
});

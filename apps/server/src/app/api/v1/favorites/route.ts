import { FavoriteSearch } from "@ordering/contracts";

import { route } from "../../../../lib/http/handler";
import { parseSearchParams } from "../../../../lib/http/json";
import { requireUser } from "../../../../modules/auth/require-user";
import { listFavorites } from "../../../../modules/favorites/favorite-service";

export const GET = route(async (request) => {
  const { userId } = await requireUser(request);
  const query = parseSearchParams(request.nextUrl.searchParams, FavoriteSearch);
  return listFavorites(userId, query);
});

import { DishSearch } from "@ordering/contracts";

import { route } from "../../../../lib/http/handler";
import { parseSearchParams } from "../../../../lib/http/json";
import { searchPublicDishes } from "../../../../modules/menu/menu-query";

export const GET = route(async (request) => {
  const query = parseSearchParams(request.nextUrl.searchParams, DishSearch);
  return searchPublicDishes(query);
});

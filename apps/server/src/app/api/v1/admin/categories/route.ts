import {
  AdminCategorySearch,
  CategoryInput,
} from "@ordering/contracts";

import { route } from "../../../../../lib/http/handler";
import {
  parseJson,
  parseSearchParams,
} from "../../../../../lib/http/json";
import { jsonSuccess } from "../../../../../lib/http/response";
import { requireAdmin } from "../../../../../modules/admin/require-admin";
import {
  createCategory,
  listAdminCategories,
} from "../../../../../modules/menu/category-service";

export const GET = route(async (request) => {
  await requireAdmin(request);
  const query = parseSearchParams(
    request.nextUrl.searchParams,
    AdminCategorySearch,
  );
  return listAdminCategories(query);
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const input = await parseJson(request, CategoryInput);
  return jsonSuccess(await createCategory(input), {
    status: 201,
  });
});

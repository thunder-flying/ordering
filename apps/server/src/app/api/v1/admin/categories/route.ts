import {
  AdminCategorySearch,
  CategoryInput,
  apiSuccess,
} from "@ordering/contracts";
import { NextResponse } from "next/server";

import { route } from "../../../../../lib/http/handler";
import {
  parseJson,
  parseSearchParams,
} from "../../../../../lib/http/json";
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
  return NextResponse.json(apiSuccess(await createCategory(input)), {
    status: 201,
  });
});

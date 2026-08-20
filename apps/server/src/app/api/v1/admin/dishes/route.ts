import {
  AdminDishSearch,
  DishInput,
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
  createDish,
  listAdminDishes,
} from "../../../../../modules/menu/dish-service";

export const GET = route(async (request) => {
  await requireAdmin(request);
  const input = parseSearchParams(
    request.nextUrl.searchParams,
    AdminDishSearch,
  );
  return listAdminDishes(input);
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const input = await parseJson(request, DishInput);
  return NextResponse.json(apiSuccess(await createDish(input)), { status: 201 });
});

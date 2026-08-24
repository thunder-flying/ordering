import type { DishAvailabilityDto, DishSearchDto, PublicCategoryDto, PublicDishDto } from "@ordering/contracts";

import { request } from "./request";

export type CursorQuery = { cursor?: string; limit?: number };
export type DishQuery = Partial<Pick<DishSearchDto, "q" | "categoryId" | "cursor" | "limit">>;

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function fetchCategories(): Promise<{ items: PublicCategoryDto[] }> {
  return request<{ items: PublicCategoryDto[] }>({ method: "GET", path: "/api/v1/categories" });
}

export function fetchDishes(query: DishQuery = {}): Promise<{ items: PublicDishDto[]; nextCursor: string | null }> {
  return request<{ items: PublicDishDto[]; nextCursor: string | null }>({
    method: "GET",
    path: withQuery("/api/v1/dishes", query),
  });
}

export function fetchDishAvailability(dishIds: string[]): Promise<{ items: DishAvailabilityDto[] }> {
  return request<{ items: DishAvailabilityDto[] }>({ method: "POST", path: "/api/v1/dishes/availability", data: { dishIds } });
}

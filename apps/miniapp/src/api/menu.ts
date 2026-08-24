import type { DishAvailabilityDto, DishSearchDto, PublicCategoryDto, PublicDishDto } from "@ordering/contracts";
import { getApiOrigin } from "../config";
import { request } from "./request";

export type CursorQuery = { cursor?: string; limit?: number };
export type DishQuery = Partial<Pick<DishSearchDto, "q" | "categoryId" | "cursor" | "limit">>;

function withAbsoluteImageUrl(dish: PublicDishDto): PublicDishDto {
  return {
    ...dish,
    imageUrl: dish.imageUrl.startsWith("/media/")
      ? `${getApiOrigin()}${dish.imageUrl}`
      : dish.imageUrl,
  };
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(query).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `${path}?${pairs.join("&")}` : path;
}
export function fetchCategories(): Promise<{ items: PublicCategoryDto[] }> { return request<{ items: PublicCategoryDto[] }>({ method: "GET", path: "/api/v1/categories" }); }
export async function fetchDishes(query: DishQuery = {}): Promise<{
  items: PublicDishDto[];
  nextCursor: string | null;
}> {
  const response = await request<{ items: PublicDishDto[]; nextCursor: string | null }>({
    method: "GET",
    path: withQuery("/api/v1/dishes", query),
  });
  return { ...response, items: response.items.map(withAbsoluteImageUrl) };
}

export async function fetchDishAvailability(dishIds: string[]): Promise<{
  items: DishAvailabilityDto[];
}> {
  const response = await request<{ items: DishAvailabilityDto[] }>({
    method: "POST",
    path: "/api/v1/dishes/availability",
    data: { dishIds },
    replaySafe: true,
  });
  return {
    items: response.items.map((item) => (
      item.available ? { ...item, dish: withAbsoluteImageUrl(item.dish) } : item
    )),
  };
}

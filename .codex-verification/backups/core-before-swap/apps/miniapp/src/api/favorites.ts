import type { FavoriteMutationDto, FavoriteSearchDto, PublicDishDto } from "@ordering/contracts";

import { request } from "./request";

export type FavoriteQuery = Partial<Pick<FavoriteSearchDto, "cursor" | "limit">>;

function favoritePath(dishId: string): string {
  return `/api/v1/favorites/${encodeURIComponent(dishId)}`;
}

export function fetchFavorites(query: FavoriteQuery = {}): Promise<{ items: PublicDishDto[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const search = params.toString();
  return request<{ items: PublicDishDto[]; nextCursor: string | null }>({ method: "GET", path: search ? `/api/v1/favorites?${search}` : "/api/v1/favorites" });
}

export function addFavorite(dishId: string): Promise<FavoriteMutationDto> {
  return request<FavoriteMutationDto>({ method: "PUT", path: favoritePath(dishId) });
}

export function removeFavorite(dishId: string): Promise<FavoriteMutationDto> {
  return request<FavoriteMutationDto>({ method: "DELETE", path: favoritePath(dishId) });
}

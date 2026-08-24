import type { FavoriteMutationDto, FavoriteSearchDto, PublicDishDto } from "@ordering/contracts";
import { request } from "./request";
export type FavoriteQuery = Partial<Pick<FavoriteSearchDto, "cursor" | "limit">>;
function favoritePath(dishId: string): string { return `/api/v1/favorites/${encodeURIComponent(dishId)}`; }
function queryPath(query: FavoriteQuery): string {
  const pairs = [query.cursor ? `cursor=${encodeURIComponent(query.cursor)}` : undefined, query.limit === undefined ? undefined : `limit=${encodeURIComponent(String(query.limit))}`].filter((value): value is string => Boolean(value));
  return pairs.length ? `/api/v1/favorites?${pairs.join("&")}` : "/api/v1/favorites";
}
export function fetchFavorites(query: FavoriteQuery = {}): Promise<{ items: PublicDishDto[]; nextCursor: string | null }> { return request<{ items: PublicDishDto[]; nextCursor: string | null }>({ method: "GET", path: queryPath(query) }); }
export function addFavorite(dishId: string): Promise<FavoriteMutationDto> { return request<FavoriteMutationDto>({ method: "PUT", path: favoritePath(dishId) }); }
export function removeFavorite(dishId: string): Promise<FavoriteMutationDto> { return request<FavoriteMutationDto>({ method: "DELETE", path: favoritePath(dishId) }); }

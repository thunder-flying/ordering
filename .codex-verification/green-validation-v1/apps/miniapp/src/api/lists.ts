import type { CopyListResultDto, SavedListDetailDto, SavedListSearchDto, SavedListSummaryDto, SaveListDto, UpdateListDto } from "@ordering/contracts";
import { request } from "./request";
type WritableItem = { dishId: string; quantity: number; note: string };
type CreateInput = Omit<SaveListDto, "items"> & { items: WritableItem[] };
type UpdateInput = Omit<UpdateListDto, "items"> & { items: WritableItem[] };
export type ListQuery = Partial<Pick<SavedListSearchDto, "cursor" | "limit">>;
function listPath(id: string): string { return `/api/v1/lists/${encodeURIComponent(id)}`; }
function writableItems(items: WritableItem[]): WritableItem[] { return items.map(({ dishId, quantity, note }) => ({ dishId, quantity, note: note.trim() })); }
function queryPath(query: ListQuery): string {
  const pairs = [query.cursor ? `cursor=${encodeURIComponent(query.cursor)}` : undefined, query.limit === undefined ? undefined : `limit=${encodeURIComponent(String(query.limit))}`].filter((value): value is string => Boolean(value));
  return pairs.length ? `/api/v1/lists?${pairs.join("&")}` : "/api/v1/lists";
}
export function fetchLists(query: ListQuery = {}): Promise<{ items: SavedListSummaryDto[]; nextCursor: string | null }> { return request<{ items: SavedListSummaryDto[]; nextCursor: string | null }>({ method: "GET", path: queryPath(query) }); }
export function fetchList(id: string): Promise<SavedListDetailDto> { return request<SavedListDetailDto>({ method: "GET", path: listPath(id) }); }
export function createList(input: CreateInput): Promise<SavedListDetailDto> { const data: SaveListDto = { name: input.name.trim(), idempotencyKey: input.idempotencyKey, items: writableItems(input.items) }; return request<SavedListDetailDto>({ method: "POST", path: "/api/v1/lists", data, idempotencyKey: data.idempotencyKey }); }
export function updateList(id: string, input: UpdateInput): Promise<SavedListDetailDto> { const data: UpdateListDto = { name: input.name.trim(), idempotencyKey: input.idempotencyKey, expectedUpdatedAt: input.expectedUpdatedAt, items: writableItems(input.items) }; return request<SavedListDetailDto>({ method: "PATCH", path: listPath(id), data, idempotencyKey: data.idempotencyKey }); }
export function copyList(id: string, input: { name: string; idempotencyKey: string }): Promise<CopyListResultDto> { const data = { name: input.name.trim(), idempotencyKey: input.idempotencyKey }; return request<CopyListResultDto>({ method: "POST", path: `${listPath(id)}/copy`, data, idempotencyKey: data.idempotencyKey }); }
export function deleteList(id: string): Promise<{ success: true }> { return request<{ success: true }>({ method: "DELETE", path: listPath(id) }); }

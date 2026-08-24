import { addFavorite, fetchFavorites, removeFavorite } from "../api/favorites";

const FAVORITES_STORAGE_KEY = "ordering.favorites:v1";
export type FavoriteState = { ids: Set<string>; loaded: boolean; pending: Set<string> };

let state: FavoriteState | undefined;
const desired = new Map<string, boolean>();
const confirmed = new Set<string>();
const work = new Map<string, Promise<void>>();

function cloneState(): FavoriteState { const current = loadCached(); return { ids: new Set(current.ids), pending: new Set(current.pending), loaded: current.loaded }; }
function cache(): void { wx.setStorageSync(FAVORITES_STORAGE_KEY, JSON.stringify([...loadCached().ids])); }
function loadCached(): FavoriteState {
  if (state) return state;
  const raw = wx.getStorageSync(FAVORITES_STORAGE_KEY); let ids: string[] = [];
  if (typeof raw === "string") { try { const parsed: unknown = JSON.parse(raw); if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) ids = parsed; else wx.removeStorageSync(FAVORITES_STORAGE_KEY); } catch { wx.removeStorageSync(FAVORITES_STORAGE_KEY); } }
  state = { ids: new Set(ids), loaded: false, pending: new Set() }; ids.forEach((id) => confirmed.add(id)); return state;
}
function apply(dishId: string, value: boolean): void { const current = loadCached(); if (value) current.ids.add(dishId); else current.ids.delete(dishId); }
async function process(dishId: string): Promise<void> {
  const current = loadCached(); current.pending.add(dishId);
  try {
    while (desired.has(dishId)) {
      const target = desired.get(dishId)!;
      if (confirmed.has(dishId) === target) { desired.delete(dishId); continue; }
      try { if (target) await addFavorite(dishId); else await removeFavorite(dishId); if (target) confirmed.add(dishId); else confirmed.delete(dishId); }
      catch (error) { if (desired.get(dishId) === target) { desired.delete(dishId); apply(dishId, confirmed.has(dishId)); cache(); } throw error; }
      if (desired.get(dishId) === target) desired.delete(dishId);
    }
    apply(dishId, confirmed.has(dishId)); cache();
  } finally { current.pending.delete(dishId); work.delete(dishId); }
}

export function getFavoriteState(): FavoriteState { return cloneState(); }
export async function loadFavorites(): Promise<void> {
  loadCached();
  const ids = new Set<string>();
  const visitedCursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    if (cursor) visitedCursors.add(cursor);
    const response = await fetchFavorites(cursor ? { cursor, limit: 50 } : { limit: 50 });
    response.items.forEach((item) => ids.add(item.id));
    const nextCursor = response.nextCursor;
    if (!nextCursor || visitedCursors.has(nextCursor)) break;
    cursor = nextCursor;
  }
  confirmed.clear(); ids.forEach((id) => confirmed.add(id));
  state = { ids: new Set(confirmed), loaded: true, pending: new Set() };
  cache();
}
export function isFavorite(dishId: string): boolean { return loadCached().ids.has(dishId); }
export function setFavorite(dishId: string, value: boolean): Promise<void> { loadCached(); desired.set(dishId, value); apply(dishId, value); const running = work.get(dishId); if (running) return running; const next = process(dishId); work.set(dishId, next); return next; }
export function clearFavorites(): void { state = { ids: new Set(), loaded: false, pending: new Set() }; desired.clear(); confirmed.clear(); work.clear(); wx.removeStorageSync(FAVORITES_STORAGE_KEY); }

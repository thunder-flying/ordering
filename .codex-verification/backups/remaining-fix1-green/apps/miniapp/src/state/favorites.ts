import { addFavorite, fetchFavorites, removeFavorite } from "../api/favorites";

const FAVORITES_STORAGE_KEY = "ordering.favorites:v1";
export type FavoriteState = { ids: Set<string>; loaded: boolean; pending: Set<string> };

let state: FavoriteState | undefined;
let loadGeneration = 0;
let revision = 0;
const mutationRevision = new Map<string, number>();
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
function markMutation(dishId: string): void { revision += 1; mutationRevision.set(dishId, revision); }
function apply(dishId: string, value: boolean): void { const current = loadCached(); if (value) current.ids.add(dishId); else current.ids.delete(dishId); }
async function process(dishId: string): Promise<void> {
  const current = loadCached(); current.pending.add(dishId);
  try {
    while (desired.has(dishId)) {
      const target = desired.get(dishId)!;
      if (confirmed.has(dishId) === target) { desired.delete(dishId); continue; }
      try {
        if (target) await addFavorite(dishId); else await removeFavorite(dishId);
        if (target) confirmed.add(dishId); else confirmed.delete(dishId);
        markMutation(dishId);
      } catch (error) {
        markMutation(dishId);
        if (desired.get(dishId) === target) { desired.delete(dishId); apply(dishId, confirmed.has(dishId)); cache(); }
        throw error;
      }
      if (desired.get(dishId) === target) desired.delete(dishId);
    }
    apply(dishId, confirmed.has(dishId)); cache();
  } finally {
    current.pending.delete(dishId);
    loadCached().pending.delete(dishId);
    work.delete(dishId);
  }
}

export function getFavoriteState(): FavoriteState { return cloneState(); }
export async function loadFavorites(): Promise<void> {
  const current = loadCached();
  const generation = ++loadGeneration;
  const baselineRevision = revision;
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
  if (generation !== loadGeneration) return;

  const nextIds = new Set(ids);
  const nextConfirmed = new Set(ids);
  mutationRevision.forEach((dishRevision, dishId) => {
    if (dishRevision <= baselineRevision) return;
    if (current.ids.has(dishId)) nextIds.add(dishId); else nextIds.delete(dishId);
    if (confirmed.has(dishId)) nextConfirmed.add(dishId); else nextConfirmed.delete(dishId);
  });
  confirmed.clear(); nextConfirmed.forEach((id) => confirmed.add(id));
  state = { ids: nextIds, loaded: true, pending: new Set(current.pending) };
  cache();
}
export function isFavorite(dishId: string): boolean { return loadCached().ids.has(dishId); }
export function setFavorite(dishId: string, value: boolean): Promise<void> { loadCached(); markMutation(dishId); desired.set(dishId, value); apply(dishId, value); const running = work.get(dishId); if (running) return running; const next = process(dishId); work.set(dishId, next); return next; }
export function clearFavorites(): void { loadGeneration += 1; revision = 0; state = { ids: new Set(), loaded: false, pending: new Set() }; desired.clear(); confirmed.clear(); mutationRevision.clear(); work.clear(); wx.removeStorageSync(FAVORITES_STORAGE_KEY); }

import { newIdempotencyKey } from "../utils/idempotency";
import { multiplyCents, sumCents } from "../utils/price";

const DRAFT_STORAGE_KEY = "ordering:draft:v1";
const MAX_NAME_LENGTH = 40;
const MAX_NOTE_LENGTH = 100;

export type DraftItem = {
  dishId: string;
  name: string;
  imageUrl: string | null;
  referencePriceCents: number;
  quantity: number;
  note: string;
};

export type Draft = {
  version: 1;
  name: string;
  items: DraftItem[];
  editTarget: null | { listId: string; expectedUpdatedAt: string };
  mutationKey: string;
  updatedAt: string;
};

let draft: Draft | undefined;

function characterLength(value: string): number { return Array.from(value).length; }
function emptyDraft(): Draft {
  return { version: 1, name: "", items: [], editTarget: null, mutationKey: newIdempotencyKey(), updatedAt: new Date().toISOString() };
}
function clone(value: Draft): Draft { return { ...value, items: value.items.map((item) => ({ ...item })), editTarget: value.editTarget ? { ...value.editTarget } : null }; }
function validItem(value: unknown): value is DraftItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DraftItem>;
  return typeof item.dishId === "string" && typeof item.name === "string" && (typeof item.imageUrl === "string" || item.imageUrl === null) && Number.isSafeInteger(item.referencePriceCents) && item.referencePriceCents >= 0 && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99 && typeof item.note === "string" && characterLength(item.note.trim()) <= MAX_NOTE_LENGTH;
}
function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Draft>;
  return candidate.version === 1 && typeof candidate.name === "string" && characterLength(candidate.name.trim()) <= MAX_NAME_LENGTH && Array.isArray(candidate.items) && candidate.items.every(validItem) && typeof candidate.mutationKey === "string" && typeof candidate.updatedAt === "string" && (candidate.editTarget === null || (typeof candidate.editTarget === "object" && typeof candidate.editTarget.listId === "string" && typeof candidate.editTarget.expectedUpdatedAt === "string"));
}
function load(): Draft {
  if (draft) return draft;
  const raw = wx.getStorageSync(DRAFT_STORAGE_KEY);
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (validDraft(parsed)) { draft = clone(parsed); return draft; }
    } catch { /* corrupted storage is cleared below */ }
    wx.removeStorageSync(DRAFT_STORAGE_KEY);
  } else if (raw !== undefined && raw !== null && raw !== "") {
    wx.removeStorageSync(DRAFT_STORAGE_KEY);
  }
  draft = emptyDraft();
  return draft;
}
function persist(visibleChange = true): void {
  const current = load();
  if (visibleChange) { current.mutationKey = newIdempotencyKey(); current.updatedAt = new Date().toISOString(); }
  wx.setStorageSync(DRAFT_STORAGE_KEY, JSON.stringify(current));
}
function text(value: string, maximum: number, field: string): string {
  const normalized = value.trim();
  if (characterLength(normalized) > maximum) throw new RangeError(`${field} is too long`);
  return normalized;
}

export function getDraft(): Draft { return clone(load()); }
export function setName(name: string): void { load().name = text(name, MAX_NAME_LENGTH, "name"); persist(); }
export function addDish(item: Omit<DraftItem, "quantity" | "note">): void {
  const current = load(); const existing = current.items.find((entry) => entry.dishId === item.dishId);
  if (existing) { if (existing.quantity < 99) { existing.quantity += 1; persist(); } return; }
  if (!Number.isSafeInteger(item.referencePriceCents) || item.referencePriceCents < 0) throw new RangeError("referencePriceCents must be a safe integer");
  current.items.push({ ...item, quantity: 1, note: "" }); persist();
}
export function setQuantity(dishId: string, quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError("quantity must be between 1 and 99");
  const item = load().items.find((entry) => entry.dishId === dishId); if (!item) return;
  item.quantity = Math.min(quantity, 99); persist();
}
export function setNote(dishId: string, note: string): void {
  const item = load().items.find((entry) => entry.dishId === dishId); if (!item) return;
  item.note = text(note, MAX_NOTE_LENGTH, "note"); persist();
}
export function removeDish(dishId: string): void {
  const current = load(); const index = current.items.findIndex((entry) => entry.dishId === dishId);
  if (index >= 0) { current.items.splice(index, 1); persist(); }
}
export function replaceDraft(next: Omit<Draft, "version" | "mutationKey" | "updatedAt">): void {
  const candidate: Draft = { version: 1, name: text(next.name, MAX_NAME_LENGTH, "name"), items: next.items.map((item) => ({ ...item, note: text(item.note, MAX_NOTE_LENGTH, "note"), quantity: Math.min(99, item.quantity) })), editTarget: next.editTarget, mutationKey: newIdempotencyKey(), updatedAt: new Date().toISOString() };
  if (!candidate.items.every(validItem)) throw new RangeError("draft contains invalid items");
  draft = candidate; wx.setStorageSync(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}
export function clearDraft(): void { draft = emptyDraft(); wx.removeStorageSync(DRAFT_STORAGE_KEY); }
export function calculateDraftTotalCents(): number { return sumCents(load().items.map((item) => multiplyCents(item.referencePriceCents, item.quantity))); }

import { afterEach, describe, expect, it, vi } from "vitest";

import { addDish, calculateDraftTotalCents, clearDraft, getDraft, setName, setNote, setQuantity } from "../../src/state/draft";

const wxBoundary = { getStorageSync: vi.fn(), setStorageSync: vi.fn(), removeStorageSync: vi.fn() };
function installWx(stored?: unknown) { Object.assign(globalThis, { wx: wxBoundary }); wxBoundary.getStorageSync.mockReturnValue(stored); }

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

describe("versioned local draft", () => {
  it("persists normalized user changes with a new mutation key", () => {
    installWx(); const firstKey = getDraft().mutationKey;
    addDish({ dishId: "dish-1", name: "菜 A", referencePriceCents: 1299, imageUrl: null }); setQuantity("dish-1", 2); setNote("dish-1", "  少辣  "); setName("  今晚清单  ");
    const draft = getDraft();
    expect(draft).toMatchObject({ version: 1, name: "今晚清单", items: [{ dishId: "dish-1", quantity: 2, note: "少辣" }] });
    expect(draft.mutationKey).not.toBe(firstKey); expect(calculateDraftTotalCents()).toBe(2598);
    expect(wxBoundary.setStorageSync).toHaveBeenLastCalledWith("ordering:draft:v1", expect.any(String));
  });

  it("clamps duplicate quantities and rejects invalid text bounds", () => {
    installWx(); addDish({ dishId: "dish-1", name: "菜 A", referencePriceCents: 0, imageUrl: null }); setQuantity("dish-1", 100);
    expect(getDraft().items[0]?.quantity).toBe(99); expect(() => setQuantity("dish-1", 0)).toThrow("quantity");
    expect(() => setNote("dish-1", "x".repeat(101))).toThrow("note"); expect(() => setName("x".repeat(41))).toThrow("name");
  });

  it("removes corrupt stored data safely", () => {
    installWx("not-json"); expect(getDraft()).toMatchObject({ version: 1, items: [] });
    expect(wxBoundary.removeStorageSync).toHaveBeenCalledWith("ordering:draft:v1"); clearDraft();
  });
});

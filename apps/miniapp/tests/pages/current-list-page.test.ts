import type { SavedListDetailDto } from "@ordering/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

type PageConfig = { data: Record<string, unknown>; [key: string]: unknown };
type PageHarness = {
  data: Record<string, unknown>;
  setData(patch: Record<string, unknown>): void;
  [key: string]: any;
};

const savedList: SavedListDetailDto = {
  id: "list-1",
  name: "周末家常菜",
  itemCount: 2,
  totalCents: 3_880,
  createdAt: "2026-08-20T08:00:00.000Z",
  updatedAt: "2026-08-20T08:00:00.000Z",
  items: [],
};

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => { resolve = done; }),
    resolve,
  };
}

function capturePage(): { get(): PageConfig } {
  let config: PageConfig | undefined;
  vi.stubGlobal("Page", (value: PageConfig) => { config = value; });
  return {
    get() {
      expect(config, "page module must register a Page config").toBeDefined();
      return config!;
    },
  };
}

function instantiate(config: PageConfig): PageHarness {
  return {
    ...config,
    data: { ...config.data },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); },
  };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock("../../src/pages/current-list/model");
});

describe("current-list page lifecycle", () => {
  it("does not steal navigation when a pending save succeeds after the page is hidden", async () => {
    const capture = capturePage();
    const response = deferred<{ status: "saved"; list: SavedListDetailDto }>();
    const save = vi.fn(() => response.promise);
    vi.doMock("../../src/pages/current-list/model", async () => {
      const actual = await vi.importActual<typeof import("../../src/pages/current-list/model")>(
        "../../src/pages/current-list/model",
      );
      return {
        ...actual,
        createCurrentListSaveController: vi.fn(() => ({ save, isPending: () => false })),
      };
    });
    const switchTab = vi.fn();
    vi.stubGlobal("wx", {
      getStorageSync: vi.fn(),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
      showToast: vi.fn(),
      switchTab,
    });

    await import("../../src/pages/current-list/index");
    const page = instantiate(capture.get());
    page.onLoad();
    page.data.canSave = true;
    page.data.saving = false;

    const saving = page.handleSave();
    expect(save).toHaveBeenCalledTimes(1);
    page.onHide?.();
    response.resolve({ status: "saved", list: savedList });
    await saving;

    expect(switchTab).not.toHaveBeenCalled();
  });
});

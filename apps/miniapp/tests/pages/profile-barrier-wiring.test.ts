import { afterEach, describe, expect, it, vi } from "vitest";

type PageConfig = { data: Record<string, unknown>; [key: string]: unknown };
type PageHarness = {
  data: Record<string, unknown>;
  setData(patch: Record<string, unknown>): void;
  [key: string]: any;
};

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
  vi.doUnmock("../../src/pages/profile/model");
  vi.doUnmock("../../src/state/favorites");
});

describe("profile favorite mutation barrier wiring", () => {
  it("injects the global favorite barrier into the destructive page flow", async () => {
    const capture = capturePage();
    let dependencies: Record<string, unknown> | undefined;
    const blockFavoriteMutations = vi.fn(() => vi.fn());
    const settleFavoriteMutations = vi.fn(async () => undefined);

    vi.doMock("../../src/pages/profile/model", async () => {
      const actual = await vi.importActual<typeof import("../../src/pages/profile/model")>(
        "../../src/pages/profile/model",
      );
      return {
        ...actual,
        runClearPrivateData: vi.fn(async (input: Record<string, unknown>) => {
          dependencies = input;
          return { status: "canceled" as const };
        }),
      };
    });
    vi.doMock("../../src/state/favorites", () => ({
      blockFavoriteMutations,
      settleFavoriteMutations,
      clearFavorites: vi.fn(),
    }));
    vi.stubGlobal("wx", { showToast: vi.fn() });

    await import("../../src/pages/profile/index");
    const page = instantiate(capture.get());
    page.data.workingAction = "";
    await page.handleClearData();

    expect(dependencies).toEqual(expect.objectContaining({
      blockFavorites: blockFavoriteMutations,
      settleFavorites: settleFavoriteMutations,
    }));
  });
});

import type { ProfileDto, SavedListDetailDto } from "@ordering/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

type PageConfig = { data: Record<string, unknown>; [key: string]: unknown };
type PageHarness = { data: Record<string, unknown>; setData(patch: Record<string, unknown>): void; [key: string]: any };

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
  const page: PageHarness = {
    ...config,
    data: { ...config.data },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); },
  };
  return page;
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  [
    "../../src/pages/current-list/model",
    "../../src/pages/my-lists/model",
    "../../src/pages/profile/model",
    "../../src/api/profile",
    "../../src/state/draft",
    "../../src/state/favorites",
    "../../src/state/profile",
    "../../src/state/session",
    "../../src/state/navigation",
  ].forEach((path) => vi.doUnmock(path));
});

describe("remaining page controller wiring", () => {
  it("wires save-time availability and page marker application into current-list save", async () => {
    const capture = capturePage();
    let dependencies: Record<string, unknown> | undefined;
    const save = vi.fn().mockResolvedValue({
      status: "unavailable",
      unavailableNames: ["桂花藕"],
    });
    vi.doMock("../../src/pages/current-list/model", async () => {
      const actual = await vi.importActual<typeof import("../../src/pages/current-list/model")>(
        "../../src/pages/current-list/model",
      );
      return {
        ...actual,
        createCurrentListSaveController: vi.fn((input: Record<string, unknown>) => {
          dependencies = input;
          return { save, isPending: () => false };
        }),
      };
    });
    vi.stubGlobal("wx", {
      getStorageSync: vi.fn(),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
      showToast: vi.fn(),
      switchTab: vi.fn(),
    });

    await import("../../src/pages/current-list/index");
    const page = instantiate(capture.get());
    page.onLoad();
    page.data.canSave = true;
    page.data.saving = false;
    await page.handleSave();

    expect(dependencies).toEqual(expect.objectContaining({
      fetchAvailability: expect.any(Function),
      applyAvailability: expect.any(Function),
    }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(page.data.unavailableNames).toEqual(["桂花藕"]);
  });

  it("wires detail invalidation and copy intent controllers into my-lists page lifecycle", async () => {
    const capture = capturePage();
    const detailController = {
      open: vi.fn().mockResolvedValue({ status: "committed" }),
      invalidate: vi.fn(),
    };
    const copyController = {
      copy: vi.fn(),
      isPending: () => false,
    };
    const detailFactory = vi.fn(() => detailController);
    const copyFactory = vi.fn(() => copyController);
    const pager = {
      loadMore: vi.fn().mockResolvedValue({ status: "committed" }),
      refresh: vi.fn().mockResolvedValue({ status: "committed" }),
      remove: vi.fn(),
      upsert: vi.fn(),
      getState: () => ({ items: [], nextCursor: null, loading: false }),
    };
    vi.doMock("../../src/pages/my-lists/model", async () => {
      const actual = await vi.importActual<typeof import("../../src/pages/my-lists/model")>(
        "../../src/pages/my-lists/model",
      );
      return {
        ...actual,
        createSavedListsPager: vi.fn(() => pager),
        createDetailRequestCoordinator: detailFactory,
        createCopyListController: copyFactory,
      };
    });
    vi.stubGlobal("getApp", () => ({ globalData: { ready: Promise.resolve() } }));
    vi.stubGlobal("wx", {
      setNavigationBarTitle: vi.fn(),
      stopPullDownRefresh: vi.fn(),
    });

    await import("../../src/pages/my-lists/index");
    const page = instantiate(capture.get());
    page.onLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(detailFactory).toHaveBeenCalledTimes(1);
    expect(copyFactory).toHaveBeenCalledTimes(1);
    page.handleBackToList();
    expect(detailController.invalidate).toHaveBeenCalledTimes(1);
    page.onUnload();
    expect(detailController.invalidate).toHaveBeenCalledTimes(2);
  });

  it("wires favorite mutation settling before the profile page clears remote data", async () => {
    const capture = capturePage();
    const calls: string[] = [];
    vi.doMock("../../src/api/profile", () => ({
      clearPrivateData: async () => { calls.push("remote"); },
      deleteAccount: async () => undefined,
    }));
    vi.doMock("../../src/state/draft", () => ({
      clearDraft: () => { calls.push("draft"); },
    }));
    vi.doMock("../../src/state/favorites", () => ({
      blockFavoriteMutations: () => {
        calls.push("block");
        return () => { calls.push("release"); };
      },
      settleFavoriteMutations: async () => { calls.push("settle"); },
      clearFavorites: () => { calls.push("favorites"); },
    }));
    vi.doMock("../../src/state/navigation", () => ({ requestFavoriteSelectionView: vi.fn() }));
    vi.doMock("../../src/state/profile", () => ({
      clearProfileState: vi.fn(),
      loadProfile: vi.fn(),
      saveNickname: vi.fn(),
      saveProfileAvatar: vi.fn(),
    }));
    vi.doMock("../../src/state/session", () => ({ clearSession: vi.fn() }));
    vi.stubGlobal("wx", {
      showModal: (options: { success(result: { confirm: boolean }): void }) => {
        calls.push("confirm");
        options.success({ confirm: true });
      },
      showToast: vi.fn(),
    });

    await import("../../src/pages/profile/index");
    const page = instantiate(capture.get());
    page.data.workingAction = "";
    page.data.phase = "ready";
    await page.handleClearData();

    expect(calls).toEqual(["confirm", "block", "settle", "remote", "draft", "favorites", "release"]);
  });

  it("keeps a successful avatar baseline visible and the unfinished nickname retryable in the profile page", async () => {
    const capture = capturePage();
    const savedProfile: ProfileDto = {
      nickname: "小满",
      avatarUrl: "https://example.test/avatar-old.jpg",
      profileComplete: true,
      onboardingCompleted: true,
    };
    const avatarSaved: ProfileDto = {
      ...savedProfile,
      avatarUrl: "https://example.test/avatar-new.jpg",
    };
    const finalProfile: ProfileDto = { ...avatarSaved, nickname: "新名字" };
    const saveAvatar = vi.fn().mockResolvedValue(avatarSaved);
    const saveNickname = vi.fn()
      .mockRejectedValueOnce(new Error("nickname failed"))
      .mockResolvedValueOnce(finalProfile);
    vi.doMock("../../src/api/profile", () => ({
      clearPrivateData: vi.fn(),
      deleteAccount: vi.fn(),
    }));
    vi.doMock("../../src/state/profile", () => ({
      clearProfileState: vi.fn(),
      loadProfile: async () => savedProfile,
      saveNickname,
      saveProfileAvatar: saveAvatar,
    }));
    vi.stubGlobal("getApp", () => ({ globalData: { ready: Promise.resolve() } }));
    vi.stubGlobal("wx", { showToast: vi.fn() });

    await import("../../src/pages/profile/index");
    const page = instantiate(capture.get());
    await page.loadInitialProfile();
    page.setData({
      nickname: "新名字",
      avatarTempPath: "wxfile://avatar.jpg",
      avatarUrl: "wxfile://avatar.jpg",
      canSave: true,
    });

    await page.handleSaveProfile();
    expect(page.data).toMatchObject({
      phase: "ready",
      nickname: "新名字",
      avatarUrl: "https://example.test/avatar-new.jpg",
      avatarTempPath: null,
      canSave: true,
    });

    await page.handleSaveProfile();
    expect(saveAvatar).toHaveBeenCalledTimes(1);
    expect(saveNickname).toHaveBeenCalledTimes(2);
    expect(page.data).toMatchObject({
      nickname: "新名字",
      avatarUrl: "https://example.test/avatar-new.jpg",
      canSave: false,
    });
  });
});

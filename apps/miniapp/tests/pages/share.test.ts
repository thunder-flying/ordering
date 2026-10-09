import { afterEach, expect, it, vi } from "vitest";

type SharePage = {
  data: Record<string, unknown>;
  onShareTimeline?: (this: { data: Record<string, unknown> }) => {
    title: string;
    query: string;
  };
  onShareAppMessage?: (this: { data: Record<string, unknown> }) => {
    title: string;
    path: string;
  };
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadPage(name: string): Promise<SharePage> {
  let page!: SharePage;
  vi.stubGlobal("Page", (config: SharePage) => { page = config; });
  vi.stubGlobal("wx", { getStorageSync: () => undefined });
  await import(`../../src/pages/${name}/index.ts`);
  return page;
}

it.each(["select", "onboarding", "current-list", "my-lists", "profile", "dish-detail"])(
  "%s allows forwarding without exposing personal state",
  async (name: string) => {
    const page = await loadPage(name);
    expect(page.onShareAppMessage).toBeTypeOf("function");
    const share = page.onShareAppMessage!.call({ data: page.data });
    expect(share.path).toBe("/pages/select/index");
    expect(share.title.length).toBeGreaterThan(0);
  },
);

it("dish forwarding preserves and encodes the dish identifier", async () => {
  const page = await loadPage("dish-detail");
  expect(page.onShareAppMessage).toBeTypeOf("function");
  const share = page.onShareAppMessage!.call({
    data: { ...page.data, dishId: "dish /&1", dish: { name: "番茄炒蛋" } },
  });
  expect(share.path).toBe("/pages/dish-detail/index?id=dish%20%2F%261");
  expect(share.title).toContain("番茄炒蛋");
});

it.each(["select", "onboarding", "current-list", "my-lists", "profile", "dish-detail"])(
  "%s allows sharing to Moments without carrying private parameters",
  async (name: string) => {
    const page = await loadPage(name);
    expect(page.onShareTimeline).toBeTypeOf("function");
    const share = page.onShareTimeline!.call({ data: page.data });
    expect(share.query).toBe("");
    expect(share.title.length).toBeGreaterThan(0);
    expect(share).not.toHaveProperty("path");
  },
);

it("dish Moments sharing carries an encoded identifier and dish title", async () => {
  const page = await loadPage("dish-detail");
  expect(page.onShareTimeline).toBeTypeOf("function");
  const share = page.onShareTimeline!.call({
    data: { ...page.data, dishId: "dish /&1", dish: { name: "番茄炒蛋" } },
  });
  expect(share.query).toBe("id=dish%20%2F%261");
  expect(share.title).toContain("番茄炒蛋");
  expect(share).not.toHaveProperty("path");
});

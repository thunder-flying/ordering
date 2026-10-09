import { afterEach, expect, it, vi } from "vitest";

type SharePage = {
  data: Record<string, unknown>;
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

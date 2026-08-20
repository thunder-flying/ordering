import { describe, expect, it } from "vitest";

import { SaveListInput, UpdateListInput } from "./lists";

const dishId = "cmt0zapt70000wcmdx75rhyss";

describe("saved list contracts", () => {
  it("normalizes list text and accepts a valid update timestamp", () => {
    const parsed = UpdateListInput.parse({
      expectedUpdatedAt: "2026-08-20T04:00:00.000Z",
      idempotencyKey: "37f60a20-5778-4ae6-9127-f4e16d84ec59",
      items: [{ dishId, note: " 少盐 ", quantity: 2 }],
      name: " 周末菜单 ",
    });

    expect(parsed.name).toBe("周末菜单");
    expect(parsed.items[0]?.note).toBe("少盐");
  });

  it("rejects duplicate dishes instead of double-counting them", () => {
    expect(() =>
      SaveListInput.parse({
        idempotencyKey: "37f60a20-5778-4ae6-9127-f4e16d84ec59",
        items: [
          { dishId, note: "", quantity: 1 },
          { dishId, note: "", quantity: 2 },
        ],
        name: "重复菜品",
      }),
    ).toThrow();
  });

  it("rejects a client-supplied price", () => {
    expect(() =>
      SaveListInput.parse({
        idempotencyKey: "37f60a20-5778-4ae6-9127-f4e16d84ec59",
        items: [
          {
            dishId,
            note: "",
            quantity: 1,
            referencePriceCents: 1,
          },
        ],
        name: "价格只能由服务端读取",
      }),
    ).toThrow();
  });

  it("enforces non-empty lists, quantity limits, and at most 100 items", () => {
    const base = {
      idempotencyKey: "37f60a20-5778-4ae6-9127-f4e16d84ec59",
      name: "边界测试",
    };

    expect(() => SaveListInput.parse({ ...base, items: [] })).toThrow();
    expect(() =>
      SaveListInput.parse({
        ...base,
        items: [{ dishId, note: "", quantity: 100 }],
      }),
    ).toThrow();
    expect(() =>
      SaveListInput.parse({
        ...base,
        items: Array.from({ length: 101 }, (_, index) => ({
          dishId: `cm${String(index).padStart(23, "0")}`,
          note: "",
          quantity: 1,
        })),
      }),
    ).toThrow();
  });
});

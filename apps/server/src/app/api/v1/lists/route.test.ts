import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { createList, requireUser } = vi.hoisted(() => ({
  createList: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("../../../../modules/auth/require-user", () => ({ requireUser }));
vi.mock("../../../../modules/lists/list-service", () => ({
  createList,
  listLists: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/v1/lists", () => {
  it("returns a 201 response whose body code matches the HTTP status", async () => {
    const dishId = "cmt0zapt70000wcmdx75rhyss";
    const input = {
      idempotencyKey: "37f60a20-5778-4ae6-9127-f4e16d84ec59",
      items: [{ dishId, note: "", quantity: 1 }],
      name: "周末菜单",
    };
    requireUser.mockResolvedValue({ userId: "user-1" });
    createList.mockResolvedValue({ id: "list-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/v1/lists", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    );

    expect(createList).toHaveBeenCalledWith("user-1", input);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      code: 201,
      message: "success",
      data: { id: "list-1" },
    });
  });
});

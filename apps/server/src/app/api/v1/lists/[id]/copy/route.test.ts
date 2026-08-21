import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { copyList, requireUser } = vi.hoisted(() => ({
  copyList: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("../../../../../../modules/auth/require-user", () => ({ requireUser }));
vi.mock("../../../../../../modules/lists/list-service", () => ({ copyList }));

import { POST } from "./route";

describe("POST /api/v1/lists/:id/copy", () => {
  it("returns a 201 response whose body code matches the HTTP status", async () => {
    const listId = "cmt0zapt70000wcmdx75rhyss";
    const input = {
      idempotencyKey: "37f60a20-5778-4ae6-9127-f4e16d84ec59",
      name: "复制菜单",
    };
    requireUser.mockResolvedValue({ userId: "user-1" });
    copyList.mockResolvedValue({ id: "list-copy-1" });

    const response = await POST(
      new NextRequest(`http://localhost/api/v1/lists/${listId}/copy`, {
        body: JSON.stringify(input),
        method: "POST",
      }),
      { params: Promise.resolve({ id: listId }) },
    );

    expect(copyList).toHaveBeenCalledWith("user-1", listId, input);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      code: 201,
      message: "success",
      data: { id: "list-copy-1" },
    });
  });
});

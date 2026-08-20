import { describe, expect, it } from "vitest";

import {
  ClearPrivateDataInput,
  DeleteAccountInput,
  UpdateNicknameInput,
} from "./profile";

describe("profile contracts", () => {
  it("trims a valid nickname and rejects unknown fields", () => {
    expect(UpdateNicknameInput.parse({ nickname: " 小明 " })).toEqual({
      nickname: "小明",
    });
    expect(() =>
      UpdateNicknameInput.parse({ nickname: "小明", userId: "forbidden" }),
    ).toThrow();
  });

  it("requires exact destructive-action confirmations", () => {
    expect(() =>
      ClearPrivateDataInput.parse({ confirmation: "CLEAR" }),
    ).toThrow();
    expect(() =>
      DeleteAccountInput.parse({ confirmation: "DELETE" }),
    ).toThrow();
  });
});

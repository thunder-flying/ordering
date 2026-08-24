import type { ApiResponse, AuthSessionDto } from "@ordering/contracts";

import { toApiUrl } from "../config";
import type { StoredSession } from "../state/session";

function wxLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({ success: ({ code }) => (code ? resolve(code) : reject(new Error("微信登录未返回 code"))), fail: reject });
  });
}

function exchangeCode(code: string): Promise<StoredSession> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: toApiUrl("/api/v1/auth/wechat"), method: "POST", data: { code },
      success: (response) => {
        const body = response.data as ApiResponse<AuthSessionDto>;
        if (body.code >= 200 && body.code < 300 && body.data !== null) {
          resolve({ token: body.data.token, expiresAt: body.data.expiresAt, onboardingCompleted: body.data.onboardingCompleted }); return;
        }
        reject(new Error(body.message));
      }, fail: reject,
    });
  });
}

export async function loginWithWechat(): Promise<StoredSession> { return exchangeCode(await wxLogin()); }

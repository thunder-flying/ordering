export const API_ORIGINS = {
  develop: "http://127.0.0.1:3000",
  trial: "https://menu.example.com",
  release: "https://menu.example.com",
} as const;

type Environment = keyof typeof API_ORIGINS;

export function getApiOrigin(): (typeof API_ORIGINS)[Environment] {
  const environment = wx.getAccountInfoSync?.().miniProgram.envVersion;
  return API_ORIGINS[environment as Environment] ?? API_ORIGINS.develop;
}

export function toApiUrl(path: string): string {
  if (!/^\/api\/v1(?:\/|$)/.test(path) || path.startsWith("//")) {
    throw new Error("Request path must be a relative /api/v1 path");
  }
  return `${getApiOrigin()}${path}`;
}

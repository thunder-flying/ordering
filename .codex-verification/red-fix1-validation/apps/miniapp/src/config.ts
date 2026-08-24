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

function decodePathSegment(segment: string): string {
  let decoded = segment;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new Error("Request path must be a relative /api/v1 path");
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  return decoded;
}

function isSafePath(path: string): boolean {
  if (path.includes("#") || path.includes("\\")) return false;
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  if (!/^\/api\/v1(?:\/|$)/.test(pathname) || pathname.startsWith("//")) return false;
  return pathname.split("/").every((segment) => {
    const decoded = decodePathSegment(segment);
    return decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\\");
  });
}

export function toApiUrl(path: string): string {
  if (!isSafePath(path)) throw new Error("Request path must be a relative /api/v1 path");
  return `${getApiOrigin()}${path}`;
}

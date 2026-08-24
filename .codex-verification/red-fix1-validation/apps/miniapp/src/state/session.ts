import { loginWithWechat } from "../api/auth";

export type StoredSession = { token: string; expiresAt: string; onboardingCompleted: boolean };
const SESSION_STORAGE_KEY = "ordering.session.v1";
let loginInFlight: Promise<StoredSession> | undefined;
function readStoredSession(): StoredSession | undefined {
  const raw = wx.getStorageSync(SESSION_STORAGE_KEY); if (typeof raw !== "string") return undefined;
  try {
    const session = JSON.parse(raw) as Partial<StoredSession>;
    return typeof session.token === "string" && typeof session.expiresAt === "string" && typeof session.onboardingCompleted === "boolean" && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt) > Date.now() ? session as StoredSession : undefined;
  } catch { return undefined; }
}
function createSession(): Promise<StoredSession> {
  loginInFlight ??= loginWithWechat().then((session) => { wx.setStorageSync(SESSION_STORAGE_KEY, JSON.stringify(session)); return session; }).finally(() => { loginInFlight = undefined; });
  return loginInFlight;
}
export async function ensureSession(force = false): Promise<StoredSession> { const stored = !force ? readStoredSession() : undefined; return stored ?? createSession(); }
export function clearSession(): void { wx.removeStorageSync(SESSION_STORAGE_KEY); }
/** Persists a narrowly scoped session flag without returning the session credential. */
export function markOnboardingCompleted(): void {
  const stored = readStoredSession(); if (!stored || stored.onboardingCompleted) return;
  wx.setStorageSync(SESSION_STORAGE_KEY, JSON.stringify({ ...stored, onboardingCompleted: true }));
}

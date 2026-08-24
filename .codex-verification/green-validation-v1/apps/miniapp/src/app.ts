import { ensureSession } from "./state/session";

const ready = ensureSession();

ready.then(
  (session) => {
    if (!session.onboardingCompleted) {
      wx.reLaunch({ url: "/pages/onboarding/index" });
    }
  },
  () => undefined,
);

App({
  globalData: { ready },
  onLaunch() {
    // Login starts at module load so pages can use the shared readiness promise.
  },
});

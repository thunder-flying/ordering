import { ensureSession } from "./state/session";

const ready = ensureSession();

// Session readiness must not interrupt browsing with optional profile authorization.
ready.catch(() => undefined);

App({
  globalData: { ready },
  onLaunch() {
    // Login starts at module load so pages can use the shared readiness promise.
  },
});

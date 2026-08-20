import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const pidFile = resolve(".playwright-server.pid");

export default async function globalTeardown() {
  let pid = 0;
  try {
    pid = Number(await readFile(pidFile, "utf8"));
  } catch {
    return;
  }
  if (Number.isInteger(pid) && pid > 0) {
    try {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      // A server that already exited needs no further cleanup.
    }
  }
  await rm(pidFile, { force: true });
}

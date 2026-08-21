import { AdminLoginRequest } from "@ordering/contracts";

import { route } from "../../../../../lib/http/handler";
import { parseJson } from "../../../../../lib/http/json";
import { jsonSuccess } from "../../../../../lib/http/response";
import {
  checkAdminLoginRateLimit,
  clearAdminCookie,
  createAdminSession,
} from "../../../../../modules/admin/admin-session";
import { requireAdmin } from "../../../../../modules/admin/require-admin";

const SAFE_ADDRESS = /^[0-9A-Fa-f:.]{1,64}$/;

function sourceAddress(request: Request): string {
  const forwarded =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && SAFE_ADDRESS.test(forwarded) ? forwarded : "unknown";
}

export const POST = route(async (request) => {
  const input = await parseJson(request, AdminLoginRequest);
  checkAdminLoginRateLimit(
    `${sourceAddress(request)}:${input.username.toLocaleLowerCase("en-US")}`,
  );
  const session = await createAdminSession(input.username, input.password);
  const response = jsonSuccess({
    csrfToken: session.csrf,
    expiresAt: session.expiresAt,
  });
  response.headers.append("set-cookie", session.cookie);
  return response;
});

export const GET = route(async (request) => {
  const claims = await requireAdmin(request);
  return {
    csrfToken: claims.csrf,
    expiresAt: new Date(claims.exp * 1_000).toISOString(),
  };
});

export const DELETE = route(async (request) => {
  await requireAdmin(request);
  const response = jsonSuccess({ success: true as const });
  response.headers.append("set-cookie", clearAdminCookie());
  return response;
});

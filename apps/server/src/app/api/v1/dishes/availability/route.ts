import { DishAvailabilityRequest } from "@ordering/contracts";

import { route } from "../../../../../lib/http/handler";
import { parseJson } from "../../../../../lib/http/json";
import { checkRateLimit } from "../../../../../lib/security/rate-limit";
import { resolveDishAvailability } from "../../../../../modules/menu/menu-query";

const AVAILABILITY_RATE_RULE = { limit: 60, windowMs: 60_000 };

export const POST = route(async (request) => {
  const source = request.headers.get("x-real-ip") ?? "unknown";
  checkRateLimit(`dish-availability:${source.slice(0, 64)}`, AVAILABILITY_RATE_RULE);
  const input = await parseJson(request, DishAvailabilityRequest);
  return { items: await resolveDishAvailability(input.dishIds) };
});

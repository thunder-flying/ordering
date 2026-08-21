import { route } from "../../../../lib/http/handler";
import { jsonFailure } from "../../../../lib/http/response";
import { prisma } from "../../../../lib/prisma";

export const GET = route(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" as const };
  } catch {
    return jsonFailure(503, "服务暂时不可用");
  }
});

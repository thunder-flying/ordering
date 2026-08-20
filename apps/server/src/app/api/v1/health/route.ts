import { apiSuccess } from "@ordering/contracts";
import { NextResponse } from "next/server";

import { route } from "../../../../lib/http/handler";
import { prisma } from "../../../../lib/prisma";

export const GET = route(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" as const };
  } catch {
    return NextResponse.json(apiSuccess({ status: "unavailable" as const }), {
      status: 503,
    });
  }
});

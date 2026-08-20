import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import type { ReactNode } from "react";

import { AdminShell } from "../../../components/admin/admin-shell";
import { ADMIN_COOKIE_NAME } from "../../../modules/admin/admin-session";
import { requireAdmin } from "../../../modules/admin/require-admin";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  if (!token) redirect("/admin/login");

  let csrfToken: string;
  try {
    const request = new NextRequest("https://ordering.local/admin", {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}` },
    });
    const claims = await requireAdmin(request);
    csrfToken = claims.csrf;
  } catch {
    redirect("/admin/login?expired=1");
  }
  return <AdminShell csrfToken={csrfToken}>{children}</AdminShell>;
}

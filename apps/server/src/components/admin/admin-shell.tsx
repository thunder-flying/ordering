"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

import { adminFetch } from "../../lib/admin-api";

type AdminContextValue = {
  request<T>(pathname: string, init?: RequestInit): Promise<T>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdminRequest(): AdminContextValue["request"] {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdminRequest must be used inside AdminShell");
  return context.request;
}

const navigation = [
  { href: "/admin", label: "数据概览", mark: "01" },
  { href: "/admin/categories", label: "分类整理", mark: "02" },
  { href: "/admin/dishes", label: "菜品图鉴", mark: "03" },
];

export function AdminShell({
  children,
  csrfToken,
}: {
  children: ReactNode;
  csrfToken: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const request = useCallback(
    <T,>(url: string, init?: RequestInit) =>
      adminFetch<T>(url, init, csrfToken),
    [csrfToken],
  );

  async function logout() {
    setLoggingOut(true);
    try {
      await request("/api/v1/admin/session", { method: "DELETE" });
      router.replace("/admin/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <AdminContext.Provider value={{ request }}>
      <div className="admin-frame">
        <aside className="admin-sidebar">
          <div className="brand-block">
            <span className="brand-stamp" aria-hidden="true">
              家
            </span>
            <div>
              <p className="brand-kicker">PERSONAL MENU</p>
              <p className="brand-name">家常菜单簿</p>
            </div>
          </div>

          <nav aria-label="后台主导航" className="admin-nav">
            {navigation.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "nav-link is-active" : "nav-link"}
                  href={item.href}
                  key={item.href}
                >
                  <span>{item.mark}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-note">
            <span aria-hidden="true">✦</span>
            <p>这里只整理公共菜单，不展示任何人的昵称、头像或私人清单。</p>
          </div>
          <button
            className="text-button sidebar-logout"
            disabled={loggingOut}
            onClick={logout}
            type="button"
          >
            {loggingOut ? "正在退出…" : "退出管理"}
          </button>
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}

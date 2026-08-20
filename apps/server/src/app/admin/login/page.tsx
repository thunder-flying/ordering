"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

import { adminFetch, AdminApiError } from "../../../lib/admin-api";

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await adminFetch("/api/v1/admin/session", {
        body: JSON.stringify({
          password: form.get("password"),
          username: form.get("username"),
        }),
        method: "POST",
      });
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof AdminApiError
          ? caught.message
          : "登录暂时不可用，请稍后再试",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-title">
        <div className="login-edition">私房 · 第一期</div>
        <p className="login-eyebrow">PERSONAL MENU ARCHIVE</p>
        <h1 id="login-title">
          把爱吃的菜，
          <br />
          慢慢整理成册。
        </h1>
        <p className="login-copy">
          这是你的家庭菜单后台。分类、图片、参考价格与上架状态，都在这里安静地维护。
        </p>
        <div className="tomato-sketch" aria-hidden="true">
          <span>菜单</span>
        </div>
      </section>

      <section className="login-panel" aria-label="管理员登录">
        <form className="login-form" onSubmit={submit}>
          <div>
            <p className="section-index">ADMIN / 01</p>
            <h2>回到菜单簿</h2>
            <p>仅限唯一管理员使用</p>
          </div>
          {searchParams.get("expired") === "1" && !error ? (
            <p className="form-notice" role="status">
              登录状态已失效，请重新登录。
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="field">
            <span>管理员账号</span>
            <input
              autoComplete="username"
              maxLength={64}
              name="username"
              required
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              autoComplete="current-password"
              maxLength={256}
              name="password"
              required
              type="password"
            />
          </label>
          <button className="primary-button login-button" disabled={pending}>
            {pending ? "正在核对…" : "登录"}
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="login-page" aria-busy="true" />}>
      <AdminLoginContent />
    </Suspense>
  );
}

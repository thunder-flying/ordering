"use client";

import type { AdminStatsDto } from "@ordering/contracts";
import { useEffect, useState } from "react";

import { useAdminRequest } from "../../../components/admin/admin-shell";

const metrics: Array<{
  key: keyof Pick<
    AdminStatsDto,
    "activeUsers7d" | "favoriteCount" | "listCount" | "userCount"
  >;
  label: string;
  note: string;
}> = [
  { key: "userCount", label: "使用人数", note: "累计静默登录" },
  { key: "activeUsers7d", label: "近 7 日活跃用户", note: "只统计人数" },
  { key: "favoriteCount", label: "收藏次数", note: "所有匿名收藏" },
  { key: "listCount", label: "保存清单", note: "不读取清单名称" },
];

export default function AdminDashboardPage() {
  const request = useAdminRequest();
  const [stats, setStats] = useState<AdminStatsDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    request<AdminStatsDto>("/api/v1/admin/stats")
      .then(setStats)
      .catch(() => setError("统计数据暂时没有取到，请稍后刷新。"));
  }, [request]);

  return (
    <div className="admin-page dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <p className="section-index">OVERVIEW / 01</p>
          <h1>数据概览</h1>
          <p>只看趋势，不看任何人的身份与私人内容。</p>
        </div>
        <time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(new Date())}</time>
      </header>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <section className="metric-grid" aria-label="匿名汇总数据">
        {metrics.map((metric, index) => (
          <article className="metric-card" key={metric.key}>
            <span className="metric-number">{stats ? stats[metric.key] : "—"}</span>
            <div>
              <h2>{metric.label}</h2>
              <p>{metric.note}</p>
            </div>
            <span className="card-index" aria-hidden="true">0{index + 1}</span>
          </article>
        ))}
      </section>

      <section className="popularity-sheet" aria-labelledby="popular-title">
        <div className="sheet-heading">
          <div>
            <p className="section-index">FAVORITES / TOP 10</p>
            <h2 id="popular-title">最常被收藏</h2>
          </div>
          <span className="privacy-seal">匿名汇总</span>
        </div>
        {!stats ? (
          <p className="empty-copy">正在翻阅菜单簿…</p>
        ) : stats.topDishes.length === 0 ? (
          <p className="empty-copy">还没有收藏记录，等第一份偏爱出现。</p>
        ) : (
          <ol className="popular-list">
            {stats.topDishes.map((dish, index) => (
              <li key={dish.dishId}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{dish.dishName}</strong>
                <i aria-hidden="true" />
                <em>{dish.favoriteCount} 次收藏</em>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

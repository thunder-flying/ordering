"use client";

import type { AdminCategoryDto, CategoryInputDto } from "@ordering/contracts";
import { useCallback, useEffect, useState } from "react";

import { useAdminRequest } from "../../../../components/admin/admin-shell";
import { CategoryForm } from "../../../../components/admin/category-form";
import { ConfirmDialog } from "../../../../components/admin/confirm-dialog";

export default function CategoriesPage() {
  const request = useAdminRequest();
  const [categories, setCategories] = useState<AdminCategoryDto[]>([]);
  const [editing, setEditing] = useState<AdminCategoryDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminCategoryDto | null>(null);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await request<{ items: AdminCategoryDto[] }>(
        "/api/v1/admin/categories?limit=50&includeDeleted=false",
      );
      setCategories(page.items);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分类读取失败");
    }
  }, [request]);

  useEffect(() => {
    let cancelled = false;
    void request<{ items: AdminCategoryDto[] }>(
      "/api/v1/admin/categories?limit=50&includeDeleted=false",
    )
      .then((page) => {
        if (!cancelled) setCategories(page.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "分类读取失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  async function save(input: CategoryInputDto) {
    if (editing === "new") {
      await request("/api/v1/admin/categories", {
        body: JSON.stringify(input),
        method: "POST",
      });
    } else if (editing) {
      await request(`/api/v1/admin/categories/${editing.id}`, {
        body: JSON.stringify({ ...input, expectedUpdatedAt: editing.updatedAt }),
        method: "PATCH",
      });
    }
    setEditing(null);
    await load();
  }

  async function remove() {
    if (!deleting) return;
    setPendingDelete(true);
    try {
      await request(`/api/v1/admin/categories/${deleting.id}`, {
        body: JSON.stringify({ expectedUpdatedAt: deleting.updatedAt }),
        method: "DELETE",
      });
      setDeleting(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "删除失败，请先移动或删除分类中的菜品。",
      );
      setDeleting(null);
    } finally {
      setPendingDelete(false);
    }
  }

  return (
    <div className="admin-page manager-page">
      <header className="page-header">
        <div>
          <p className="section-index">CATEGORIES / 02</p>
          <h1>分类整理</h1>
          <p>像整理食谱索引一样，决定顺序与公开状态。</p>
        </div>
        <button className="primary-button" onClick={() => setEditing("new")}>
          新增分类 <span aria-hidden="true">＋</span>
        </button>
      </header>

      {error ? <p className="form-error page-message" role="alert">{error}</p> : null}
      <div className={editing ? "manager-layout has-editor" : "manager-layout"}>
        <section className="record-sheet" aria-label="分类列表">
          <div className="record-heading category-row">
            <span>顺序</span><span>分类</span><span>菜品</span><span>状态</span><span>操作</span>
          </div>
          {categories.length === 0 ? (
            <p className="empty-copy record-empty">还没有分类，先建立第一张索引卡。</p>
          ) : categories.map((category) => (
            <article className="category-row record-row" key={category.id}>
              <span className="mono-value">{String(category.sortOrder).padStart(2, "0")}</span>
              <strong>{category.name}</strong>
              <span>{category.dishCount} 道</span>
              <span className={category.enabled ? "status-tag is-live" : "status-tag"}>
                {category.enabled ? "公开" : "隐藏"}
              </span>
              <span className="row-actions">
                <button className="text-button" onClick={() => setEditing(category)}>编辑</button>
                <button className="text-button danger-text" onClick={() => setDeleting(category)}>删除</button>
              </span>
            </article>
          ))}
        </section>
        {editing ? (
          <CategoryForm
            category={editing === "new" ? null : editing}
            key={editing === "new" ? "new" : editing.id}
            onCancel={() => setEditing(null)}
            onSubmit={save}
          />
        ) : null}
      </div>
      <ConfirmDialog
        body={deleting ? `“${deleting.name}”删除后不可恢复；若仍有菜品，系统会拒绝删除。` : ""}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
        open={deleting !== null}
        pending={pendingDelete}
        title="删除这个分类？"
      />
    </div>
  );
}

"use client";

import type {
  AdminCategoryDto,
  AdminDishDto,
  DishInputDto,
  UploadDto,
} from "@ordering/contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useAdminRequest } from "../../../../components/admin/admin-shell";
import { ConfirmDialog } from "../../../../components/admin/confirm-dialog";
import { DishForm } from "../../../../components/admin/dish-form";
import { AdminApiError } from "../../../../lib/admin-api";
import { formatPriceCents } from "../../../../components/admin/price-input";

export default function DishesPage() {
  const request = useAdminRequest();
  const [categories, setCategories] = useState<AdminCategoryDto[]>([]);
  const [dishes, setDishes] = useState<AdminDishDto[]>([]);
  const [editing, setEditing] = useState<AdminDishDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminDishDto | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);

  const loadCategories = useCallback(async () => {
    const page = await request<{ items: AdminCategoryDto[] }>(
      "/api/v1/admin/categories?limit=50&includeDeleted=false",
    );
    setCategories(page.items);
  }, [request]);

  const loadDishes = useCallback(async () => {
    const params = new URLSearchParams({
      includeDeleted: "false",
      limit: "50",
      q: query,
    });
    if (categoryFilter) params.set("categoryId", categoryFilter);
    try {
      const page = await request<{ items: AdminDishDto[] }>(
        `/api/v1/admin/dishes?${params}`,
      );
      setDishes(page.items);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "菜品读取失败");
    }
  }, [categoryFilter, query, request]);

  useEffect(() => {
    let cancelled = false;
    void request<{ items: AdminCategoryDto[] }>(
      "/api/v1/admin/categories?limit=50&includeDeleted=false",
    )
      .then((page) => {
        if (!cancelled) setCategories(page.items);
      })
      .catch(() => {
        if (!cancelled) setError("分类读取失败，请先检查服务状态。");
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      includeDeleted: "false",
      limit: "50",
      q: query,
    });
    if (categoryFilter) params.set("categoryId", categoryFilter);
    void request<{ items: AdminDishDto[] }>(`/api/v1/admin/dishes?${params}`)
      .then((page) => {
        if (!cancelled) setDishes(page.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "菜品读取失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [categoryFilter, query, request]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setQuery(String(form.get("q") ?? "").trim());
    setCategoryFilter(String(form.get("categoryId") ?? ""));
  }

  async function upload(file: File): Promise<UploadDto> {
    const form = new FormData();
    form.set("file", file);
    return request<UploadDto>("/api/v1/admin/uploads/dish-image", {
      body: form,
      method: "POST",
    });
  }

  async function save(input: DishInputDto) {
    try {
      if (editing === "new") {
        await request("/api/v1/admin/dishes", {
          body: JSON.stringify(input),
          method: "POST",
        });
      } else if (editing) {
        await request(`/api/v1/admin/dishes/${editing.id}`, {
          body: JSON.stringify({ ...input, expectedUpdatedAt: editing.updatedAt }),
          method: "PATCH",
        });
      }
      setEditing(null);
      await loadDishes();
      await loadCategories();
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.code === "CONFLICT") {
        await loadDishes();
        throw new Error("这道菜刚刚被修改，列表已刷新，请重新打开后再保存。");
      }
      throw caught;
    }
  }

  async function remove() {
    if (!deleting) return;
    setPendingDelete(true);
    try {
      await request(`/api/v1/admin/dishes/${deleting.id}`, {
        body: JSON.stringify({ expectedUpdatedAt: deleting.updatedAt }),
        method: "DELETE",
      });
      setDeleting(null);
      await loadDishes();
      await loadCategories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "菜品删除失败");
      setDeleting(null);
    } finally {
      setPendingDelete(false);
    }
  }

  return (
    <div className="admin-page manager-page">
      <header className="page-header">
        <div>
          <p className="section-index">DISHES / 03</p>
          <h1>菜品图鉴</h1>
          <p>维护图片、简介、参考价格和小程序上架状态。</p>
        </div>
        <button
          className="primary-button"
          disabled={categories.length === 0}
          onClick={() => setEditing("new")}
        >
          新增菜品 <span aria-hidden="true">＋</span>
        </button>
      </header>

      <form className="filter-bar" onSubmit={search}>
        <label>
          <span className="sr-only">搜索菜品</span>
          <input defaultValue={query} maxLength={40} name="q" placeholder="按菜名搜索…" />
        </label>
        <label>
          <span className="sr-only">筛选分类</span>
          <select defaultValue={categoryFilter} name="categoryId">
            <option value="">全部分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <button className="secondary-button">查找</button>
      </form>

      {categories.length === 0 ? (
        <p className="form-notice page-message">请先建立至少一个分类，再添加菜品。</p>
      ) : null}
      {error ? <p className="form-error page-message" role="alert">{error}</p> : null}

      <div className={editing ? "manager-layout has-editor dish-layout" : "manager-layout dish-layout"}>
        <section className="dish-grid" aria-label="菜品列表">
          {dishes.length === 0 ? (
            <p className="empty-copy record-empty">没有找到菜品，换个条件或添加第一道菜。</p>
          ) : dishes.map((dish) => (
            <article className="dish-card" key={dish.id}>
              <div className="dish-image-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={dish.imageUrl} />
                <span className={dish.published ? "status-tag is-live" : "status-tag"}>
                  {dish.published ? "上架" : "草稿"}
                </span>
              </div>
              <div className="dish-card-body">
                <p className="dish-category">{dish.categoryName}</p>
                <h2>{dish.name}</h2>
                <p>{dish.description || "暂无简介"}</p>
                <div className="dish-meta">
                  <strong>¥ {formatPriceCents(dish.referencePriceCents)}</strong>
                  <span>排序 {dish.sortOrder}</span>
                </div>
                <div className="row-actions dish-actions">
                  <button className="text-button" onClick={() => setEditing(dish)}>编辑</button>
                  <button className="text-button danger-text" onClick={() => setDeleting(dish)}>删除</button>
                </div>
              </div>
            </article>
          ))}
        </section>
        {editing ? (
          <DishForm
            categories={categories}
            dish={editing === "new" ? null : editing}
            key={editing === "new" ? "new" : editing.id}
            onCancel={() => setEditing(null)}
            onSubmit={save}
            onUpload={upload}
          />
        ) : null}
      </div>
      <ConfirmDialog
        body={deleting ? `“${deleting.name}”会从公共菜单移除，历史清单仍保留名称和价格快照。` : ""}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
        open={deleting !== null}
        pending={pendingDelete}
        title="删除这道菜？"
      />
    </div>
  );
}

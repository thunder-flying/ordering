"use client";

import type { AdminCategoryDto, CategoryInputDto } from "@ordering/contracts";
import { type FormEvent, useState } from "react";

export function CategoryForm({
  category,
  onCancel,
  onSubmit,
}: {
  category: AdminCategoryDto | null;
  onCancel(): void;
  onSubmit(input: CategoryInputDto): Promise<void>;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const sortOrder = Number(form.get("sortOrder"));
    if (!name || name.length > 20 || !Number.isInteger(sortOrder) || sortOrder < 0) {
      setError("请检查分类名称和排序值。名称最多 20 个字，排序须为非负整数。");
      return;
    }
    setPending(true);
    try {
      await onSubmit({
        enabled: form.get("enabled") === "on",
        name,
        sortOrder,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editor-card" onSubmit={submit}>
      <div className="editor-heading">
        <div>
          <p className="section-index">CATEGORY EDITOR</p>
          <h2>{category ? "修改分类" : "新增分类"}</h2>
        </div>
        <button className="text-button" onClick={onCancel} type="button">
          关闭
        </button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <label className="field">
        <span>分类名称</span>
        <input defaultValue={category?.name} maxLength={20} name="name" required />
      </label>
      <label className="field">
        <span>排序值</span>
        <input
          defaultValue={category?.sortOrder ?? 0}
          max={9999}
          min={0}
          name="sortOrder"
          required
          type="number"
        />
      </label>
      <label className="check-field">
        <input defaultChecked={category?.enabled ?? true} name="enabled" type="checkbox" />
        <span>在小程序公开显示此分类</span>
      </label>
      <button className="primary-button" disabled={pending}>
        {pending ? "正在保存…" : category ? "保存修改" : "加入菜单簿"}
      </button>
    </form>
  );
}

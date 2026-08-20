"use client";

import type {
  AdminCategoryDto,
  AdminDishDto,
  DishInputDto,
  UploadDto,
} from "@ordering/contracts";
import { type FormEvent, useEffect, useState } from "react";

import { formatPriceCents, parsePriceCents } from "./price-input";

export function DishForm({
  categories,
  dish,
  onCancel,
  onSubmit,
  onUpload,
}: {
  categories: AdminCategoryDto[];
  dish: AdminDishDto | null;
  onCancel(): void;
  onSubmit(input: DishInputDto): Promise<void>;
  onUpload(file: File): Promise<UploadDto>;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(dish?.imageUrl ?? "");

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const sortOrder = Number(form.get("sortOrder"));

    try {
      if (!name || name.length > 40 || description.length > 300) {
        throw new Error("菜品名称为必填且最多 40 个字，简介最多 300 个字。");
      }
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9_999) {
        throw new Error("排序值须为 0 到 9999 的整数。");
      }
      const referencePriceCents = parsePriceCents(
        String(form.get("referencePrice") ?? ""),
      );
      setPending(true);
      const uploaded = file ? await onUpload(file) : null;
      const imageUploadId = uploaded?.id ?? dish?.imageUploadId;
      if (!imageUploadId) throw new Error("请先选择一张菜品图片。");

      await onSubmit({
        categoryId: String(form.get("categoryId")),
        description,
        imageUploadId,
        name,
        published: form.get("published") === "on",
        referencePriceCents,
        sortOrder,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "菜品保存失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editor-card dish-editor" onSubmit={submit}>
      <div className="editor-heading">
        <div>
          <p className="section-index">DISH EDITOR</p>
          <h2>{dish ? "修改菜品" : "新增菜品"}</h2>
        </div>
        <button className="text-button" onClick={onCancel} type="button">关闭</button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <label className="image-picker">
        <span>{previewUrl ? "更换菜品图片" : "选择菜品图片"}</span>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="菜品图片预览" src={previewUrl} />
        ) : <span className="image-placeholder" aria-hidden="true">＋ 图片</span>}
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="菜品图片"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            setFile(nextFile);
            setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : (dish?.imageUrl ?? ""));
          }}
          type="file"
        />
      </label>
      <label className="field">
        <span>所属分类</span>
        <select defaultValue={dish?.categoryId ?? categories[0]?.id} name="categoryId" required>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>菜品名称</span>
        <input defaultValue={dish?.name} maxLength={40} name="name" required />
      </label>
      <label className="field">
        <span>菜品简介</span>
        <textarea defaultValue={dish?.description} maxLength={300} name="description" />
      </label>
      <div className="field-pair">
        <label className="field">
          <span>参考价格（元）</span>
          <input
            defaultValue={dish ? formatPriceCents(dish.referencePriceCents) : "0.00"}
            inputMode="decimal"
            name="referencePrice"
            required
          />
        </label>
        <label className="field">
          <span>排序值</span>
          <input defaultValue={dish?.sortOrder ?? 0} max={9999} min={0} name="sortOrder" required type="number" />
        </label>
      </div>
      <label className="check-field">
        <input defaultChecked={dish?.published ?? false} name="published" type="checkbox" />
        <span>保存后立即在小程序上架</span>
      </label>
      <button className="primary-button" disabled={pending || categories.length === 0}>
        {pending ? "正在保存…" : dish ? "保存修改" : "收入菜品图鉴"}
      </button>
    </form>
  );
}

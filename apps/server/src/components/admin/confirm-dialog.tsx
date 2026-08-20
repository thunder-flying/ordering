"use client";

export function ConfirmDialog({
  body,
  confirmLabel = "确认删除",
  onCancel,
  onConfirm,
  open,
  pending = false,
  title,
}: {
  body: string;
  confirmLabel?: string;
  onCancel(): void;
  onConfirm(): void;
  open: boolean;
  pending?: boolean;
  title: string;
}) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="confirm-dialog"
        role="alertdialog"
      >
        <p className="section-index">PLEASE CONFIRM</p>
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            先不操作
          </button>
          <button
            autoFocus
            className="danger-button"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending ? "正在处理…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

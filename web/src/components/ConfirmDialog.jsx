export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isDangerous = true,
  isConfirming = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg"
      >
        <h3 id="confirm-dialog-title" className="mb-2 text-lg font-bold text-navy">
          {title}
        </h3>
        {message && <p className="mb-6 text-sm text-gray-500">{message}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-full px-4 py-1.5 text-sm text-gray-500 outline-none transition-colors duration-150 hover:text-navy focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            autoFocus
            className={`rounded-full px-4 py-1.5 text-sm font-medium text-white outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
              isDangerous
                ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-400"
                : "bg-navy hover:bg-navy-dark focus-visible:ring-gold/60"
            }`}
          >
            {isConfirming ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

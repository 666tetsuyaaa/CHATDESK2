export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-gray-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-navy" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
    >
      <span>{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

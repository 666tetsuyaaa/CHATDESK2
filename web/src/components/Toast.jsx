import { useEffect } from "react";

export default function Toast({ message, onDismiss, duration = 4000 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timeout = setTimeout(onDismiss, duration);
    return () => clearTimeout(timeout);
  }, [message, onDismiss, duration]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        role="alert"
        className="flex items-center gap-3 rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 shadow-lg"
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-full text-red-400 outline-none transition-colors duration-150 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

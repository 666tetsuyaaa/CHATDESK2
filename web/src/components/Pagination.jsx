import { useRef, useState } from "react";

export const PAGE_SIZE = 20;

// The rows of one page, for lists loaded whole (Announcements, Phases...).
export const pageSlice = (rows, page) => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

// Page buttons to show: always the first and last, the current one with a
// neighbour each side, and "…" for the gaps - 1 … 4 5 6 … 12.
function pageItems(page, totalPages) {
  const shown = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
  if (page <= 3) [2, 3, 4].forEach((n) => n <= totalPages && shown.add(n));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => n >= 1 && shown.add(n));
  const items = [];
  let last = 0;
  [...shown].sort((a, b) => a - b).forEach((n) => {
    if (n - last > 1) items.push(`gap-${n}`);
    items.push(n);
    last = n;
  });
  return items;
}

const BUTTON =
  "min-w-8 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export default function Pagination({ page, count, onPageChange }) {
  const barRef = useRef(null);
  const [jump, setJump] = useState("");
  const [jumpError, setJumpError] = useState("");
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (totalPages <= 1) return null;

  // A new page starts at the top of the list: the bar sits under the list,
  // so after paging the admin was left at the bottom of the new page.
  const goTo = (next) => {
    if (next === page) return;
    onPageChange(next);
    const list = barRef.current?.parentElement;
    if (!list) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    list.style.scrollMarginTop = "16px";
    list.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };

  const submitJump = (e) => {
    e.preventDefault();
    const n = Number(jump);
    if (!Number.isInteger(n) || n < 1 || n > totalPages) {
      setJumpError(`Enter 1 to ${totalPages}`);
      return;
    }
    setJumpError("");
    setJump("");
    goTo(n);
  };

  const rangeStart = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, count);

  return (
    <div ref={barRef} className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
      <p className="text-xs text-gray-500">
        Showing <span className="font-medium text-navy">{rangeStart}</span>
        {"–"}
        <span className="font-medium text-navy">{rangeEnd}</span> of{" "}
        <span className="font-medium text-navy">{count}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className={`${BUTTON} border-gray-200 text-navy hover:border-gold`}
          >
            Previous
          </button>
          {pageItems(page, totalPages).map((item) =>
            typeof item === "string" ? (
              <span key={item} className="px-1 text-xs text-gray-400" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => goTo(item)}
                aria-current={item === page ? "page" : undefined}
                aria-label={`Page ${item}`}
                className={`${BUTTON} ${
                  item === page ? "border-navy bg-navy text-white" : "border-gray-200 text-navy hover:border-gold"
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => goTo(page + 1)}
            disabled={page >= totalPages}
            className={`${BUTTON} border-gray-200 text-navy hover:border-gold`}
          >
            Next
          </button>
        </nav>
        {totalPages > 5 && (
          <form onSubmit={submitJump} noValidate className="ml-1 flex items-center gap-1.5">
            <label htmlFor="page-jump" className="text-xs text-gray-500">
              Go to page
            </label>
            <input
              id="page-jump"
              type="number"
              inputMode="numeric"
              min={1}
              max={totalPages}
              value={jump}
              onChange={(e) => {
                setJump(e.target.value);
                setJumpError("");
              }}
              aria-invalid={Boolean(jumpError)}
              aria-describedby={jumpError ? "page-jump-error" : undefined}
              className={`w-16 rounded-full border px-2.5 py-1 text-xs text-navy focus:outline-none focus:ring-2 focus:ring-gold/40 ${
                jumpError ? "border-red-400" : "border-gray-200"
              }`}
            />
            <button type="submit" className={`${BUTTON} border-gray-200 text-navy hover:border-gold`}>
              Go
            </button>
            {jumpError && (
              <span id="page-jump-error" role="alert" className="text-xs text-red-600">
                {jumpError}
              </span>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function Pagination({ page, count, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (totalPages <= 1) return null;

  const rangeStart = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
      <p className="text-xs text-gray-500">
        Showing <span className="font-medium text-navy">{rangeStart}</span>
        {"–"}
        <span className="font-medium text-navy">{rangeEnd}</span> of{" "}
        <span className="font-medium text-navy">{count}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-xs text-gray-500">
          Page <span className="font-medium text-navy">{page}</span> of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

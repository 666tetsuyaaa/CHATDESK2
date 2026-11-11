const STYLES = {
  pending: "bg-yellow-100 text-yellow-800 ring-yellow-800/15",
  active: "bg-blue-100 text-blue-800 ring-blue-800/15",
  resolved: "bg-green-100 text-green-800 ring-green-800/15",
};

const DOTS = {
  pending: "bg-yellow-600",
  active: "bg-blue-600",
  resolved: "bg-green-600",
};

const LABELS = {
  pending: "Pending",
  active: "Active",
  resolved: "Resolved",
};

export default function TicketStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        STYLES[status] ?? "bg-gray-100 text-gray-600 ring-gray-500/20"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status] ?? "bg-gray-400"}`} />
      {LABELS[status] ?? status}
    </span>
  );
}

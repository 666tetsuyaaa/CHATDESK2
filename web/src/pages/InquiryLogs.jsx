import { useEffect, useState } from "react";
import { getInquiryLogs } from "../api/inquiryLogs.js";
import { getOffices } from "../api/offices.js";
import Pagination from "../components/Pagination.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import ScrollTable from "../components/ScrollTable.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatManila } from "../utils/dates.js";

const FILTER_CLASS =
  "rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40";

export default function InquiryLogs() {
  const { currentUser } = useAuth();
  const isOfficeAdmin = currentUser?.role === "office_admin";
  const [offices, setOffices] = useState([]);
  const [officeFilter, setOfficeFilter] = useState("");
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [knownIntents, setKnownIntents] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [intentFilter, setIntentFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [debouncedUserFilter, setDebouncedUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const loadLogs = () => {
    setIsLoading(true);
    getInquiryLogs({
      page,
      intent: intentFilter || undefined,
      user_id: debouncedUserFilter || undefined,
      office: officeFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then((res) => {
        const rows = res.data.results ?? res.data;
        setLogs(rows);
        setTotalCount(res.data.count ?? rows.length);
        setKnownIntents((prev) => {
          const next = new Set(prev);
          rows.forEach((log) => next.add(log.detected_intent));
          return next;
        });
      })
      .catch(() => setError("Could not load inquiry logs."))
      .finally(() => setIsLoading(false));
  };

  // Escalated stat reflects the true total (ignoring filters), matching the
  // pattern used for stat tiles on Tickets/FAQs.
  const loadEscalatedCount = () => {
    getInquiryLogs({ page: 1, is_escalated: true })
      .then((res) => {
        const rows = res.data.results ?? res.data;
        setEscalatedCount(res.data.count ?? rows.length);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedUserFilter(userFilter), 300);
    return () => clearTimeout(timeout);
  }, [userFilter]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentFilter, debouncedUserFilter, officeFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, intentFilter, debouncedUserFilter, officeFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadEscalatedCount();
    if (!isOfficeAdmin) {
      getOffices()
        .then((res) => setOffices(res.data.results ?? res.data))
        .catch(() => {});
    }
  }, [isOfficeAdmin]);

  const handleClearFilters = () => {
    setIntentFilter("");
    setUserFilter("");
    setOfficeFilter("");
    setDateFrom("");
    setDateTo("");
  };

  if (isLoading && logs.length === 0) return <LoadingState label="Loading inquiry logs..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          label="Total Inquiries"
          value={totalCount}
          accentClass="bg-navy/10 text-navy"
          icon={
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <StatTile
          label="Escalated"
          value={escalatedCount}
          accentClass="bg-status-pending/15 text-status-pending"
          icon={
            <path
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto text-lg font-bold text-navy">Inquiry Logs</h3>
        <select
          value={intentFilter}
          onChange={(e) => setIntentFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40"
        >
          <option value="">All Intents</option>
          {[...knownIntents].sort().map((intent) => (
            <option key={intent} value={intent}>
              {intent}
            </option>
          ))}
        </select>
        {!isOfficeAdmin && (
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} aria-label="Office" className={FILTER_CLASS}>
            <option value="">All Offices</option>
            <option value="unassigned">Unassigned</option>
            {offices.map((o) => (
              <option key={o.office_id} value={String(o.office_id)}>{o.name}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          inputMode="numeric"
          placeholder="User ID"
          aria-label="User ID"
          value={userFilter}
          // IDs are numbers - anything else would just return nothing.
          onChange={(e) => setUserFilter(e.target.value.replace(/\D/g, ""))}
          className="w-28 rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <button
          type="button"
          onClick={handleClearFilters}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy transition-colors hover:border-gold"
        >
          Clear Filters
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Student</th>
              <th className="px-5 py-3">Message</th>
              <th className="px-5 py-3">Intent</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3">Escalated</th>
              <th className="px-5 py-3">Feedback</th>
              <th className="px-5 py-3 text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-500">
                  No logs match your filters.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.log_id}
                  className="border-b border-gray-50 text-navy transition-colors last:border-0 hover:bg-gray-50/80"
                >
                  <td className="px-5 py-3.5 text-gray-500">
                    <div>#{log.user_id}</div>
                  </td>
                  <td className="max-w-sm px-5 py-3.5">
                    <div className="truncate">{log.user_message}</div>
                    {log.ticket_code && <div className="font-mono text-xs text-gray-400">{log.ticket_code}</div>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="whitespace-nowrap rounded-full bg-navy/5 px-2.5 py-0.5 text-xs font-medium text-navy">
                      {log.detected_intent}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    {log.office_name ? (
                      <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {log.office_name}
                      </span>
                    ) : (
                      <span className="italic text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        log.is_escalated
                          ? "bg-status-pending/15 text-status-pending"
                          : "bg-status-resolved/15 text-status-resolved"
                      }`}
                    >
                      {log.is_escalated ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {log.feedback === "up" ? (
                      <span className="whitespace-nowrap rounded-full bg-status-resolved/15 px-2.5 py-0.5 text-xs font-medium text-status-resolved">
                        👍 Helpful
                      </span>
                    ) : log.feedback === "down" ? (
                      <span className="whitespace-nowrap rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600">
                        👎 Not helpful
                      </span>
                    ) : (
                      <span className="italic text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right text-gray-500">
                    {formatManila(log.timestamp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </ScrollTable>
        <Pagination page={page} count={totalCount} onPageChange={setPage} />
      </div>
    </section>
  );
}

function StatTile({ label, value, icon, accentClass }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${accentClass}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {icon}
        </svg>
      </div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-navy">{value}</p>
    </div>
  );
}

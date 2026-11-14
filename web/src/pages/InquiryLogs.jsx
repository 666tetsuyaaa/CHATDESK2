import { useEffect, useState } from "react";
import { isMissingPage, useLatestLoad } from "../utils/latestLoad.js";
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
  // intent -> readable label, collected from the rows seen so far.
  const [knownIntents, setKnownIntents] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [intentFilter, setIntentFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [debouncedUserFilter, setDebouncedUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const startLoad = useLatestLoad();
  const loadLogs = () => {
    const isLatest = startLoad();
    setIsLoading(true);
    getInquiryLogs({
      page,
      intent: intentFilter || undefined,
      student: debouncedUserFilter || undefined,
      office: officeFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then((res) => {
        if (!isLatest()) return;
        setError(null);
        const rows = res.data.results ?? res.data;
        setLogs(rows);
        setTotalCount(res.data.count ?? rows.length);
        setKnownIntents((prev) => {
          const next = new Map(prev);
          rows.forEach((log) => next.set(log.detected_intent, log.intent_label ?? log.detected_intent));
          return next;
        });
      })
      .catch((err) => {
        if (!isLatest()) return;
        if (isMissingPage(err, page)) setPage(1);
        else setError("Could not load inquiry logs.");
      })
      .finally(() => {
        if (isLatest()) setIsLoading(false);
      });
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
  if (error) return <ErrorState message={error} onRetry={() => { setError(null); loadLogs(); }} />;

  return (
    <section>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
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
        <input
          type="search"
          placeholder="Search student name or email"
          aria-label="Search student name or email"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="w-full rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40 sm:w-64"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="mr-1 text-sm font-semibold text-navy">Filters</span>
        <select value={intentFilter} onChange={(e) => setIntentFilter(e.target.value)} aria-label="Outcome" className={`${FILTER_CLASS} max-w-[13rem]`}>
          <option value="">All outcomes</option>
          {[...knownIntents.entries()]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([intent, label]) => (
              <option key={intent} value={intent}>{label}</option>
            ))}
        </select>
        {!isOfficeAdmin && (
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} aria-label="Office" className={`${FILTER_CLASS} max-w-[13rem]`}>
            <option value="">All Offices</option>
            <option value="unassigned">Unassigned</option>
            {offices.map((o) => (
              <option key={o.office_id} value={String(o.office_id)}>{o.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-500">
          From
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className={FILTER_CLASS}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-500">
          To
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className={FILTER_CLASS}
          />
        </label>
        <button
          type="button"
          onClick={handleClearFilters}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy transition-colors hover:border-gold"
        >
          Clear
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Student</th>
              <th className="px-5 py-3">Message</th>
              <th className="px-5 py-3">Outcome</th>
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
                  <td className="px-5 py-3.5">
                    <div className="max-w-[12rem] truncate text-sm font-medium">{log.user_name || "Student"}</div>
                    <div className="max-w-[12rem] truncate text-xs text-gray-500" title={log.user_email ?? undefined}>{log.user_email}</div>
                  </td>
                  <td className="max-w-sm px-5 py-3.5">
                    <div className="truncate">{log.user_message}</div>
                    {log.ticket_code && <div className="font-mono text-xs text-gray-500">{log.ticket_code}</div>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      title={log.detected_intent}
                      className="inline-block max-w-[16rem] truncate rounded-full bg-navy/5 px-2.5 py-0.5 align-middle text-xs font-medium text-navy"
                    >
                      {log.intent_label ?? log.detected_intent}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    {log.office_name ? (
                      <span className="inline-block max-w-[11rem] rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
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
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {icon}
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs leading-snug text-gray-500 sm:text-sm">{label}</p>
        <p className="text-xl font-bold tabular-nums text-navy sm:text-2xl">{value}</p>
      </div>
    </div>
  );
}

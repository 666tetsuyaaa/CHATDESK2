import { Fragment, useEffect, useState } from "react";
import { getTicket, getTicketCounts, getTicketMessages, getTickets, sendTicketMessage, updateTicket } from "../api/tickets.js";
import { getOffices } from "../api/offices.js";
import FieldError, { invalidInput } from "../components/FieldError.jsx";
import ScrollTable from "../components/ScrollTable.jsx";
import TicketStatusBadge from "../components/TicketStatusBadge.jsx";
import Pagination from "../components/Pagination.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatDuration, formatManila, staffResolutionSeconds } from "../utils/dates.js";
import { LIMITS, maxLength, requiredText, serverErrors } from "../utils/validation.js";

// issue_description is "Student asked: "..." - <outcome>." - show just the question.
const ISSUE_PATTERN = /^Student asked: "(.*)" - (?:AI could not resolve|Answered by ChatDesk)\.$/s;

function displayIssue(issueDescription) {
  const match = ISSUE_PATTERN.exec(issueDescription);
  return match ? match[1] : issueDescription;
}

const SOURCE_OPTIONS = [
  { value: "staff", label: "Needs staff" },
  { value: "ai", label: "Answered by ChatDesk" },
  { value: "all", label: "All tickets" },
];

const REPLY_MODES = [
  { value: "answer", label: "Answer & resolve" },
  { value: "message", label: "Message student" },
];

const SELECT_CLASS =
  "rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40";

export default function TicketManagement() {
  const { currentUser } = useAuth();
  const isOfficeAdmin = currentUser?.role === "office_admin";
  const [tickets, setTickets] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [aiCount, setAiCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [offices, setOffices] = useState([]);
  const [knownCategories, setKnownCategories] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [officeFilter, setOfficeFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("staff");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [rowErrors, setRowErrors] = useState({});
  const [isSending, setIsSending] = useState(false);
  const [isAssigningOffice, setIsAssigningOffice] = useState(false);
  const [replyMode, setReplyMode] = useState("answer");
  const [thread, setThread] = useState([]);
  const [threadStatus, setThreadStatus] = useState("idle");

  const loadTickets = () => {
    setIsLoading(true);
    getTickets({
      page,
      search: debouncedSearch || undefined,
      category: categoryFilter === "All" ? undefined : categoryFilter,
      office: officeFilter === "All" ? undefined : officeFilter,
      source: sourceFilter === "all" ? undefined : sourceFilter,
      status: statusFilter === "All" ? undefined : statusFilter,
      overdue: overdueOnly ? "true" : undefined,
    })
      .then((res) => {
        const rows = res.data.results ?? res.data;
        setTickets(rows);
        setTotalCount(res.data.count ?? rows.length);
        setError(null);
        setKnownCategories((prev) => {
          const next = new Set(prev);
          rows.forEach((t) => next.add(t.subject_category));
          return next;
        });
      })
      .catch(() => setError("Could not load tickets."))
      .finally(() => setIsLoading(false));
  };

  // Stat tiles reflect true totals regardless of the active filters - the
  // staff tiles count only tickets that needed (or need) a person; chatbot
  // answers have their own tile. Office-admin scoping still applies.
  // One request for all five tiles (it used to be five ticket lists).
  const loadCounts = () => {
    getTicketCounts()
      .then(({ data }) => {
        setAllCount(data.staff);
        setPendingCount(data.pending);
        setResolvedCount(data.resolved);
        setAiCount(data.ai);
        setOverdueCount(data.overdue);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, categoryFilter, officeFilter, sourceFilter, overdueOnly]);

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, statusFilter, categoryFilter, officeFilter, sourceFilter, overdueOnly]);

  useEffect(() => {
    loadCounts();
    getOffices()
      .then((res) => setOffices(res.data.results ?? res.data))
      .catch(() => {});
  }, []);

  const handleToggleRow = (ticket) => {
    setRowErrors({});
    if (expandedTicketId === ticket.ticket_id) {
      setExpandedTicketId(null);
      return;
    }
    setExpandedTicketId(ticket.ticket_id);
    setAnswerDraft(ticket.is_ai_resolved ? "" : ticket.resolution ?? "");
    setCategoryDraft(ticket.subject_category);
    setReplyMode("answer");
    loadThread(ticket.ticket_id);
  };

  const loadThread = (ticketId) => {
    setThread([]);
    setThreadStatus("loading");
    getTicketMessages(ticketId)
      .then((res) => {
        setThread(res.data);
        setThreadStatus("ready");
      })
      .catch(() => setThreadStatus("error"));
  };

  const handleSendMessage = async (ticketId) => {
    if (isSending) return;
    const problem = requiredText(answerDraft, "Message") ?? maxLength(answerDraft, LIMITS.ticketMessage, "Message");
    setRowErrors({ resolution: problem });
    if (problem) return;

    setIsSending(true);
    try {
      const res = await sendTicketMessage(ticketId, answerDraft.trim());
      setThread((prev) => [...prev, res.data]);
      setAnswerDraft("");
      loadCounts();
      // Update just this row (new status, message count) rather than
      // reloading the list: a chatbot-answered ticket moves to staff when
      // messaged, and a reload under the "Answered by ChatDesk" filter would
      // make it vanish along with the message just sent.
      getTicket(ticketId)
        .then((fresh) => setTickets((prev) => prev.map((t) => (t.ticket_id === ticketId ? fresh.data : t))))
        .catch(() => {});
    } catch (err) {
      const { fields, general } = serverErrors(err, "Could not send this message.");
      setRowErrors({ resolution: fields.body, general });
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = (ticketId) =>
    replyMode === "message" ? handleSendMessage(ticketId) : handleSendAnswer(ticketId);

  const handleSendAnswer = async (ticketId) => {
    if (isSending) return;
    const found = {
      resolution: requiredText(answerDraft, "Answer") ?? maxLength(answerDraft, LIMITS.resolution, "Answer"),
      subject_category:
        requiredText(categoryDraft, "Category") ?? maxLength(categoryDraft, LIMITS.ticketCategory, "Category"),
    };
    setRowErrors(found);
    if (found.resolution || found.subject_category) return;

    setIsSending(true);
    try {
      await updateTicket(ticketId, {
        resolution: answerDraft.trim(),
        status: "resolved",
        subject_category: categoryDraft.trim(),
      });
      setExpandedTicketId(null);
      setAnswerDraft("");
      loadTickets();
      loadCounts();
    } catch (err) {
      const { fields, general } = serverErrors(err, "Could not send this answer.");
      setRowErrors({ ...fields, general });
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateCategory = async (ticket) => {
    const trimmed = categoryDraft.trim();
    const problem = requiredText(categoryDraft, "Category") ?? maxLength(categoryDraft, LIMITS.ticketCategory, "Category");
    setRowErrors((prev) => ({ ...prev, subject_category: problem }));
    if (problem || trimmed === ticket.subject_category) return;
    try {
      await updateTicket(ticket.ticket_id, { subject_category: trimmed });
      loadTickets();
    } catch (err) {
      const { fields, general } = serverErrors(err, "Could not update the category.");
      setRowErrors((prev) => ({ ...prev, ...fields, general }));
    }
  };

  const handleAssignOffice = async (ticketId, officeId) => {
    setIsAssigningOffice(true);
    try {
      await updateTicket(ticketId, { office: officeId || null });
      loadTickets();
    } catch (err) {
      const { general } = serverErrors(err, "Could not route this ticket.");
      setRowErrors((prev) => ({ ...prev, general }));
    } finally {
      setIsAssigningOffice(false);
    }
  };

  const handleStatTileClick = (status) => {
    setSourceFilter("staff");
    setStatusFilter((prev) => (prev === status ? "All" : status));
  };

  const handleAiTileClick = () => {
    setStatusFilter("All");
    setSourceFilter((prev) => (prev === "ai" ? "staff" : "ai"));
  };

  if (isLoading && tickets.length === 0 && !error) return <LoadingState label="Loading tickets..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Staff Tickets"
          value={allCount}
          accentClass="bg-navy/10 text-navy"
          isActive={sourceFilter === "staff" && statusFilter === "All"}
          onClick={() => handleStatTileClick("All")}
          icon={
            <path
              d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6V7Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <StatTile
          label="Pending"
          value={pendingCount}
          accentClass="bg-status-pending/15 text-status-pending"
          isActive={sourceFilter === "staff" && statusFilter === "pending"}
          onClick={() => handleStatTileClick("pending")}
          icon={
            <path
              d="M12 8v4l3 3M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <StatTile
          label="Resolved"
          value={resolvedCount}
          accentClass="bg-status-resolved/15 text-status-resolved"
          isActive={sourceFilter === "staff" && statusFilter === "resolved"}
          onClick={() => handleStatTileClick("resolved")}
          icon={
            <path
              d="m20 6-11 11-5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <StatTile
          label="Answered by ChatDesk"
          value={aiCount}
          accentClass="bg-gold/15 text-gold-ink"
          isActive={sourceFilter === "ai"}
          onClick={handleAiTileClick}
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
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto text-lg font-bold text-navy">Tickets</h3>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, question or code"
          aria-label="Search tickets"
          className="w-full rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40 sm:w-64"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="mr-1 text-sm font-semibold text-navy">Filters</span>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Ticket source" className={SELECT_CLASS}>
          {SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category" className={SELECT_CLASS}>
          <option value="All">All Categories</option>
          {[...knownCategories].sort().map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        {!isOfficeAdmin && (
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} aria-label="Office" className={SELECT_CLASS}>
            <option value="All">All Offices</option>
            <option value="unassigned">Unassigned</option>
            {offices.map((o) => (
              <option key={o.office_id} value={String(o.office_id)}>{o.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setOverdueOnly((prev) => !prev)}
          aria-pressed={overdueOnly}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            overdueOnly
              ? "border-red-600 bg-red-600 text-white"
              : overdueCount > 0
                ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                : "border-gray-200 bg-white text-gray-500 hover:border-gold/50"
          }`}
        >
          Overdue ({overdueCount})
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Ticket</th>
                <th className="px-5 py-3">From</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Office</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-sm text-gray-500">
                    {overdueOnly
                      ? "No overdue tickets."
                      : sourceFilter === "staff" && statusFilter === "pending"
                      ? "No pending tickets - the staff queue is clear."
                      : "No tickets match these filters."}
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const resolutionSeconds = staffResolutionSeconds(ticket);
                  return (
                    <Fragment key={ticket.ticket_id}>
                      <tr
                        onClick={() => handleToggleRow(ticket)}
                        className="cursor-pointer border-b border-gray-50 align-top text-navy transition-colors last:border-0 hover:bg-gray-50/80"
                      >
                        <td className="max-w-sm px-5 py-3.5">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="truncate font-semibold">{ticket.title}</span>
                            <span className="font-mono text-xs text-gray-500">{ticket.ticket_code}</span>
                          </div>
                          <div className="truncate text-sm text-gray-500">{displayIssue(ticket.issue_description)}</div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            Submitted {formatManila(ticket.created_at)}
                            {ticket.resolved_at && !ticket.is_ai_resolved && resolutionSeconds != null && (
                              <> · Resolved in {formatDuration(resolutionSeconds)}</>
                            )}
                            {ticket.message_count > 0 && (
                              <> · {ticket.message_count} {ticket.message_count === 1 ? "message" : "messages"}</>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="max-w-[12rem] truncate text-sm" title={ticket.user_email ?? undefined}>
                            {ticket.user_email ?? <span className="italic text-gray-500">Deleted student</span>}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {ticket.student_course || "Student"}
                          </div>
                        </td>
                        <td className="max-w-[9rem] px-5 py-3.5 text-sm text-gray-500">{ticket.subject_category}</td>
                        <td className="px-5 py-3.5 text-sm">
                          {ticket.office_name ? (
                            <span className="inline-block max-w-[11rem] rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                              {ticket.office_name}
                            </span>
                          ) : (
                            <span className="italic text-gray-400">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <TicketStatusBadge status={ticket.status} />
                            {ticket.is_overdue && (
                              <span
                                title={`Waiting since ${formatManila(ticket.waiting_since)}`}
                                className="whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600"
                              >
                                Overdue
                              </span>
                            )}
                            {ticket.is_ai_resolved && (
                              <span className="whitespace-nowrap rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-ink">
                                ChatDesk answer
                              </span>
                            )}
                            {ticket.reopened_at && (
                              <span className="whitespace-nowrap rounded-full bg-status-pending/15 px-2 py-0.5 text-[11px] font-semibold text-status-pending">
                                Follow-up
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedTicketId === ticket.ticket_id && (
                        <tr className="border-b border-gray-50 bg-gray-50/60">
                          <td colSpan={5} className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="table-row-panel">
                              <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                                <TimelineItem label="Submitted" value={formatManila(ticket.created_at)} />
                                {ticket.reopened_at && (
                                  <TimelineItem label="Moved to staff" value={formatManila(ticket.reopened_at)} />
                                )}
                                <TimelineItem
                                  label={ticket.is_ai_resolved ? "Answered by ChatDesk" : "Resolved"}
                                  value={ticket.resolved_at ? formatManila(ticket.resolved_at) : "Not yet"}
                                />
                                {!ticket.is_ai_resolved && ticket.resolved_at && (
                                  <TimelineItem label="Time to resolve" value={formatDuration(resolutionSeconds)} />
                                )}
                                {ticket.status === "pending" && ticket.waiting_since && !ticket.is_ai_resolved && (
                                  <TimelineItem label="Waiting on staff since" value={formatManila(ticket.waiting_since)} />
                                )}
                              </dl>

                              {ticket.conversation_context && (
                                <div className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {ticket.reopened_at ? "Conversation and follow-up" : "Conversation before this ticket"}
                                  </p>
                                  <p className="whitespace-pre-wrap text-sm text-navy">{ticket.conversation_context}</p>
                                </div>
                              )}

                              {ticket.is_ai_resolved && (
                                <div className="mb-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold-ink">ChatDesk&apos;s answer</p>
                                  <p className="whitespace-pre-wrap text-sm text-navy">{ticket.resolution}</p>
                                  <p className="mt-2 text-xs text-gray-500">
                                    Already answered from the FAQs. Reply below only if the student needs more - that moves the ticket to staff.
                                  </p>
                                </div>
                              )}

                              <TicketThread
                                messages={thread}
                                status={threadStatus}
                                onRetry={() => loadThread(ticket.ticket_id)}
                              />

                              <div className="mb-3 flex flex-wrap items-start gap-4">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <label htmlFor={`category-${ticket.ticket_id}`} className="text-sm font-medium text-gray-600">
                                      Category:
                                    </label>
                                    <input
                                      id={`category-${ticket.ticket_id}`}
                                      type="text"
                                      value={categoryDraft}
                                      onChange={(e) => setCategoryDraft(e.target.value)}
                                      onBlur={() => handleUpdateCategory(ticket)}
                                      aria-invalid={Boolean(rowErrors.subject_category)}
                                      className={`w-48 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40 ${invalidInput(rowErrors.subject_category)}`}
                                    />
                                  </div>
                                  <FieldError message={rowErrors.subject_category} />
                                </div>
                                {!isOfficeAdmin && (
                                  <div className="flex items-center gap-2">
                                    <label htmlFor={`office-${ticket.ticket_id}`} className="text-sm font-medium text-gray-600">
                                      Route to office:
                                    </label>
                                    <select
                                      id={`office-${ticket.ticket_id}`}
                                      value={ticket.office ?? ""}
                                      disabled={isAssigningOffice}
                                      onChange={(e) => handleAssignOffice(ticket.ticket_id, e.target.value)}
                                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-50"
                                    >
                                      <option value="">Unassigned</option>
                                      {offices.map((o) => (
                                        <option key={o.office_id} value={o.office_id}>{o.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              <div role="radiogroup" aria-label="Reply type" className="mb-2 inline-flex rounded-full border border-gray-200 bg-white p-0.5">
                                {REPLY_MODES.map((mode) => (
                                  <button
                                    key={mode.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={replyMode === mode.value}
                                    onClick={() => {
                                      setReplyMode(mode.value);
                                      setRowErrors({});
                                    }}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                      replyMode === mode.value ? "bg-navy text-white" : "text-gray-500 hover:text-navy"
                                    }`}
                                  >
                                    {mode.label}
                                  </button>
                                ))}
                              </div>
                              <p className="mb-2 text-xs text-gray-500">
                                {replyMode === "message"
                                  ? "Ask a question or give an update. The ticket stays open and the student gets an email."
                                  : "Your final answer. The ticket is marked resolved and the student gets an email."}
                              </p>
                              <div className="flex items-end gap-3">
                                <div className="flex-1">
                                  <textarea
                                    rows={2}
                                    value={answerDraft}
                                    onChange={(e) => setAnswerDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend(ticket.ticket_id);
                                      }
                                    }}
                                    maxLength={replyMode === "message" ? LIMITS.ticketMessage : LIMITS.resolution}
                                    placeholder={
                                      replyMode === "message"
                                        ? "Write a message to the student..."
                                        : ticket.is_ai_resolved
                                          ? "Add a staff answer (optional)..."
                                          : "State your answer..."
                                    }
                                    aria-label={replyMode === "message" ? "Message to the student" : "Answer to the student"}
                                    aria-invalid={Boolean(rowErrors.resolution)}
                                    className={`w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40 ${invalidInput(rowErrors.resolution)}`}
                                  />
                                  <FieldError message={rowErrors.resolution} />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSend(ticket.ticket_id)}
                                  disabled={!answerDraft.trim() || isSending}
                                  className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-navy-dark transition-opacity hover:brightness-95 disabled:opacity-40"
                                  aria-label={replyMode === "message" ? "Send message" : "Send answer"}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 20l16-8L4 4v6l10 2-10 2v6z" fill="currentColor" />
                                  </svg>
                                </button>
                              </div>
                              {rowErrors.general && (
                                <p role="alert" className="mt-2 text-sm text-red-600">{rowErrors.general}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </ScrollTable>
        <Pagination page={page} count={totalCount} onPageChange={setPage} />
      </div>
    </section>
  );
}

function TicketThread({ messages, status, onRetry }) {
  if (status === "loading") {
    return <p className="mb-3 text-xs text-gray-500">Loading messages...</p>;
  }
  if (status === "error") {
    return (
      <p className="mb-3 text-xs text-red-600">
        Could not load messages.{" "}
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Try again
        </button>
      </p>
    );
  }
  if (messages.length === 0) return null;
  return (
    <div className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Messages</p>
      <ol className="flex flex-col gap-2">
        {messages.map((message) => {
          const fromStaff = message.sender_role === "staff";
          return (
            <li key={message.message_id} className={`flex ${fromStaff ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  fromStaff ? "rounded-br-sm bg-navy text-white" : "rounded-bl-sm bg-gray-100 text-navy"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p className={`mt-1 text-[11px] ${fromStaff ? "text-white/70" : "text-gray-500"}`}>
                  {message.sender_name} · {formatManila(message.created_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TimelineItem({ label, value }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}

function StatTile({ label, value, icon, accentClass, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition-all sm:p-4 ${
        isActive ? "border-gold ring-2 ring-gold/30" : "border-gray-200 hover:border-gold/50"
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {icon}
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs leading-snug text-gray-500 sm:text-sm">{label}</p>
        <p className="text-xl font-bold tabular-nums text-navy sm:text-2xl">{value}</p>
      </div>
    </button>
  );
}

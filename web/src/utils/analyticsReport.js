// The Analytics page as a report: a CSV file (opens in Excel / Google
// Sheets) and a printable page (print it, or "Save as PDF"). Both use the
// numbers already on screen - the same filters, and an Office Admin's own
// office only (the server scopes the data).
import { formatDuration, formatManila, formatManilaDate, secondsSince } from "./dates.js";

const UNIVERSITY = "University of Science and Technology of Southern Philippines";
const OFFICE = "Office of Student Affairs";
const TITLE = "ChatDesk System Report";

const STATUS_LABELS = { pending: "Pending", active: "Active", resolved: "Resolved" };
const OTHER_LABELS = {
  conversational: "Small talk",
  needs_clarification: "Asked to clarify",
  off_topic: "Off-topic",
  unclear: "Unclear",
  duplicate_ticket: "Repeat of open ticket",
  account_info: "Asked about their account",
  asked_for_staff: "Asked for staff",
};

export function topicLabel(intent) {
  if (intent === "unresolved_complex_query") return "Sent to staff (no FAQ answer)";
  return intent
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function periodLabel(dateFrom, dateTo) {
  const day = (value) => formatManilaDate(`${value}T12:00:00+08:00`);
  if (dateFrom && dateTo) return `${day(dateFrom)} – ${day(dateTo)}`;
  if (dateFrom) return `Since ${day(dateFrom)}`;
  if (dateTo) return `Up to ${day(dateTo)}`;
  return "All time";
}

const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");

/**
 * Everything the report shows, worked out once from the analytics data:
 * { meta: {...}, summary: [[label, value]], statuses: [...], offices: [...],
 *   topics: [...], other: [...] }.
 * filters: { dateFrom, dateTo, officeLabel }; user: the admin making it.
 */
export function buildReport(data, filters, user) {
  const statusCounts = data.tickets_by_status ?? {};
  const staffTotal = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
  const topicsTotal = (data.intent_frequencies ?? []).reduce((sum, row) => sum + row.count, 0);
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "";
  const role = user?.role === "office_admin" ? "Office Admin" : "Super Admin";
  return {
    meta: {
      university: UNIVERSITY,
      office: OFFICE,
      title: TITLE,
      period: periodLabel(filters.dateFrom, filters.dateTo),
      scope: filters.officeLabel,
      generatedAt: formatManila(new Date().toISOString()),
      generatedBy: name ? `${name} (${role})` : role,
    },
    summary: [
      ["Total inquiries (questions asked)", data.total_inquiries ?? 0],
      ["Answered by ChatDesk", data.ai_answered_tickets ?? 0],
      ["Sent to staff", data.total_escalations ?? 0],
      ["Staff tickets", staffTotal],
      ["Overdue staff tickets", data.overdue_tickets ?? 0],
      ["Resolution rate (staff tickets resolved)", `${Math.round((data.resolution_rate ?? 0) * 100)}%`],
      ["Average resolution time (staff tickets)", data.avg_resolution_seconds == null ? "—" : formatDuration(data.avg_resolution_seconds)],
      ["Chat messages logged (including small talk)", data.total_messages ?? 0],
    ],
    statuses: Object.keys(STATUS_LABELS).map((key) => ({
      status: STATUS_LABELS[key],
      count: statusCounts[key] ?? 0,
      share: percent(statusCounts[key] ?? 0, staffTotal),
    })),
    offices: (data.offices ?? []).map((row) => ({
      // The code only when the name doesn't already end with it ("... (OSA)").
      office: row.office_code && !row.office_name.includes(`(${row.office_code})`)
        ? `${row.office_name} (${row.office_code})`
        : row.office_name,
      pending: row.pending,
      overdue: row.overdue,
      active: row.active,
      resolved: row.resolved,
      aiAnswered: row.ai_answered,
      oldestPending: row.oldest_pending_code
        ? `${row.oldest_pending_code} - waiting ${formatDuration(secondsSince(row.oldest_pending_at))}`
        : "—",
      avgResolution: row.avg_resolution_seconds == null ? "—" : formatDuration(row.avg_resolution_seconds),
    })),
    topics: (data.intent_frequencies ?? []).map((row, index) => ({
      rank: index + 1,
      topic: row.label ?? topicLabel(row.intent),
      count: row.count,
      share: percent(row.count, topicsTotal),
    })),
    other: (data.other_interactions ?? []).map((row) => ({
      kind: OTHER_LABELS[row.intent] ?? topicLabel(row.intent),
      count: row.count,
    })),
  };
}

// ---- CSV -----------------------------------------------------------------

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // A cell starting with = + - @ would run as a formula in Excel.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function reportCsv(report) {
  const rows = [];
  const add = (...cells) => rows.push(cells.map(csvCell).join(","));
  const { meta } = report;
  add(meta.university);
  add(meta.office);
  add(meta.title);
  add("Period", meta.period);
  add("Office", meta.scope);
  add("Generated", meta.generatedAt);
  add("Generated by", meta.generatedBy);
  add();
  add("SUMMARY");
  report.summary.forEach(([label, value]) => add(label, value));
  add();
  add("STAFF TICKETS BY STATUS");
  add("Status", "Tickets", "Share");
  report.statuses.forEach((row) => add(row.status, row.count, row.share));
  add();
  add("WORK BY OFFICE");
  add("Office", "Pending", "Overdue", "Active", "Resolved", "Answered by ChatDesk", "Oldest pending", "Average resolution");
  report.offices.forEach((row) =>
    add(row.office, row.pending, row.overdue, row.active, row.resolved, row.aiAnswered, row.oldestPending, row.avgResolution)
  );
  add();
  add("MOST-ASKED TOPICS");
  add("Rank", "Topic", "Inquiries", "Share");
  report.topics.forEach((row) => add(row.rank, row.topic, row.count, row.share));
  add();
  add("OTHER CHAT INTERACTIONS (not counted as inquiries)");
  add("Kind", "Messages");
  report.other.forEach((row) => add(row.kind, row.count));
  // The byte-order mark makes Excel read the file as UTF-8 (dashes, ñ).
  return `﻿${rows.join("\r\n")}\r\n`;
}

export function downloadReportCsv(report) {
  const blob = new Blob([reportCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ChatDesk-Report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Printable page --------------------------------------------------------

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function table(headers, rows, numericFrom = 1) {
  const head = headers.map((h, i) => `<th class="${i >= numericFrom ? "num" : ""}">${escapeHtml(h)}</th>`).join("");
  const body = rows.length
    ? rows
        .map((cells) => `<tr>${cells.map((c, i) => `<td class="${i >= numericFrom ? "num" : ""}">${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("")
    : `<tr><td colspan="${headers.length}" class="empty">None for this period.</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function reportHtml(report) {
  const { meta } = report;
  const summary = report.summary
    .map(([label, value]) => `<div class="tile"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(meta.title)} - ${escapeHtml(meta.period)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1B2A6B; margin: 0; padding: 24px; font-size: 12px; }
  header { text-align: center; border-bottom: 3px solid #F5A623; padding-bottom: 12px; margin-bottom: 16px; }
  header .university { font-size: 15px; font-weight: 700; }
  header .office { font-size: 13px; margin-top: 2px; }
  header h1 { font-size: 20px; margin: 10px 0 0; }
  .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; margin-bottom: 18px; color: #333; }
  .meta b { color: #1B2A6B; }
  h2 { font-size: 14px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ccd; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .tile { border: 1px solid #ccd; border-radius: 8px; padding: 8px 10px; break-inside: avoid; }
  .tile .label { color: #555; font-size: 10.5px; }
  .tile .value { font-size: 17px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #e3e5ef; vertical-align: top; }
  th { background: #f1f3fa; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }
  .num { text-align: right; white-space: nowrap; }
  td:first-child { min-width: 150px; }
  .empty { color: #777; font-style: italic; text-align: center; }
  tr { break-inside: avoid; }
  footer { margin-top: 24px; font-size: 10px; color: #777; text-align: center; }
  .toolbar { position: sticky; top: 0; background: #fff; padding: 8px 0 14px; text-align: right; }
  .toolbar button { background: #F5A623; color: #1B2A6B; border: 0; border-radius: 999px; padding: 8px 18px; font-weight: 700; cursor: pointer; }
  @media print { .toolbar { display: none; } body { padding: 0; } }
</style></head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <div class="university">${escapeHtml(meta.university)}</div>
    <div class="office">${escapeHtml(meta.office)}</div>
    <h1>${escapeHtml(meta.title)}</h1>
  </header>
  <div class="meta">
    <div><b>Period:</b> ${escapeHtml(meta.period)}</div>
    <div><b>Office:</b> ${escapeHtml(meta.scope)}</div>
    <div><b>Generated:</b> ${escapeHtml(meta.generatedAt)}</div>
    <div><b>Generated by:</b> ${escapeHtml(meta.generatedBy)}</div>
  </div>
  <h2>Summary</h2>
  <div class="tiles">${summary}</div>
  <h2>Staff tickets by status</h2>
  ${table(["Status", "Tickets", "Share"], report.statuses.map((r) => [r.status, r.count, r.share]))}
  <h2>Work by office</h2>
  ${table(
    ["Office", "Pending", "Overdue", "Active", "Resolved", "Answered by ChatDesk", "Oldest pending", "Avg. resolution"],
    report.offices.map((r) => [r.office, r.pending, r.overdue, r.active, r.resolved, r.aiAnswered, r.oldestPending, r.avgResolution])
  )}
  <h2>Most-asked topics</h2>
  ${table(["#", "Topic", "Inquiries", "Share"], report.topics.map((r) => [r.rank, r.topic, r.count, r.share]), 2)}
  <h2>Other chat interactions <span style="font-weight:400;color:#555">(not counted as inquiries)</span></h2>
  ${table(["Kind", "Messages"], report.other.map((r) => [r.kind, r.count]))}
  <footer>${escapeHtml(meta.title)} · ${escapeHtml(meta.university)} · Generated ${escapeHtml(meta.generatedAt)}</footer>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}

/** Opens the report in a new tab, ready to print or save as PDF. */
export function openPrintableReport(report) {
  const page = window.open("", "_blank");
  if (!page) return false; // blocked pop-up
  page.document.open();
  page.document.write(reportHtml(report));
  page.document.close();
  return true;
}

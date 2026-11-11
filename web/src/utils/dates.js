// Every date in the dashboard is shown in Manila time, whatever the viewer's
// computer is set to.
const manilaFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatManila(iso) {
  return iso ? manilaFormat.format(new Date(iso)) : "—";
}

const manilaDateFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Sep 8, 2026" - the same style as formatManila, without the time. */
export function formatManilaDate(iso) {
  return iso ? manilaDateFormat.format(new Date(iso)) : "—";
}

function plural(count, unit) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** 5,690,000 -> "65 days"; 100800 -> "1 day 4 hours"; 300 -> "5 minutes";
 * 20 -> "under a minute". Hours are dropped from 2 days on - "65 days 19
 * hours" is more precision than anyone reads. */
export function formatDuration(seconds) {
  if (seconds == null) return "—";
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days >= 2) return plural(days, "day");
  if (days) return hours ? `${plural(days, "day")} ${plural(hours, "hour")}` : plural(days, "day");
  if (hours) return minutes ? `${plural(hours, "hour")} ${plural(minutes, "minute")}` : plural(hours, "hour");
  if (minutes) return plural(minutes, "minute");
  return "under a minute";
}

/** Staff resolution time - from the follow-up request on a reopened
 * chatbot-answered ticket, otherwise from creation. Matches the backend. */
export function staffResolutionSeconds(ticket) {
  if (!ticket.resolved_at) return null;
  const start = ticket.reopened_at ?? ticket.created_at;
  return (Date.parse(ticket.resolved_at) - Date.parse(start)) / 1000;
}

export function secondsSince(iso) {
  return iso ? (Date.now() - Date.parse(iso)) / 1000 : null;
}

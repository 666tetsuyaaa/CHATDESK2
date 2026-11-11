// Every date is shown in Manila time. Manila is UTC+8 with no daylight
// saving, so it's computed directly rather than relying on the phone's
// time-zone data (Hermes' Intl support varies by device).
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatManila(iso: string | null | undefined) {
  if (!iso) return "—";
  const manila = new Date(Date.parse(iso) + MANILA_OFFSET_MS);
  const hours24 = manila.getUTCHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = String(manila.getUTCMinutes()).padStart(2, "0");
  const period = hours24 < 12 ? "AM" : "PM";
  return `${MONTHS[manila.getUTCMonth()]} ${manila.getUTCDate()}, ${manila.getUTCFullYear()}, ${hours12}:${minutes} ${period}`;
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** 183600 -> "2 days 3 hours"; 300 -> "5 minutes"; 20 -> "under a minute". */
export function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return hours ? `${plural(days, "day")} ${plural(hours, "hour")}` : plural(days, "day");
  if (hours) return minutes ? `${plural(hours, "hour")} ${plural(minutes, "minute")}` : plural(hours, "hour");
  if (minutes) return plural(minutes, "minute");
  return "under a minute";
}

/** Staff time runs from the follow-up request on a reopened chatbot-answered
 * ticket, otherwise from creation - same as the backend. */
export function staffResolutionSeconds(ticket: {
  created_at: string;
  reopened_at?: string | null;
  resolved_at?: string | null;
}) {
  if (!ticket.resolved_at) return null;
  const start = ticket.reopened_at ?? ticket.created_at;
  return (Date.parse(ticket.resolved_at) - Date.parse(start)) / 1000;
}

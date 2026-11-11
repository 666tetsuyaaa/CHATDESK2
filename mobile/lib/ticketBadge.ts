import AsyncStorage from "@react-native-async-storage/async-storage";

// The Tickets tab badge: staff answers the student hasn't opened yet, plus
// tickets with a staff message newer than when the student last opened them.
// Used by the Tickets screen and by TicketBadgeContext (which counts at
// start-up and when the app returns to the foreground, before the Tickets
// tab has ever been opened).

export type BadgeTicket = {
  ticket_id: number;
  status: string;
  is_ai_resolved: boolean;
  last_staff_message_at?: string | null;
};

// Resolved staff tickets the student has opened.
export const seenTicketsKey = (userId: number) => `chatdesk_seen_resolved_tickets_${userId}`;
// ticket id -> when the student last opened it, so a newer staff message
// shows on the tab badge.
export const seenMessagesKey = (userId: number) => `chatdesk_seen_ticket_messages_${userId}`;

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const stored = await AsyncStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function hasUnreadStaffMessage(ticket: BadgeTicket, seenAt: Record<string, string>) {
  if (!ticket.last_staff_message_at) return false;
  const lastSeen = seenAt[String(ticket.ticket_id)];
  return !lastSeen || new Date(ticket.last_staff_message_at) > new Date(lastSeen);
}

/** The badge number for these tickets, plus the "last opened" times. */
export async function countUnseen(userId: number, rows: BadgeTicket[]) {
  const seenSet = new Set(await readJson<number[]>(seenTicketsKey(userId), []));
  const seenAt = await readJson<Record<string, string>>(seenMessagesKey(userId), {});
  // Only staff replies are news - ChatDesk answers were already seen in chat.
  const count = rows.filter(
    (t) =>
      (t.status === "resolved" && !t.is_ai_resolved && !seenSet.has(t.ticket_id)) ||
      hasUnreadStaffMessage(t, seenAt)
  ).length;
  return { count, seenAt };
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { getAllPages } from "../lib/allPages";
import { countUnseen, type BadgeTicket } from "../lib/ticketBadge";

// The Tickets tab badge. Counted here at start-up and whenever the app
// returns to the foreground, so it shows before the Tickets tab is opened;
// the Tickets screen also updates it as the student opens tickets.
type TicketBadgeContextValue = {
  unseenCount: number;
  setUnseenCount: (count: number) => void;
};

const TicketBadgeContext = createContext<TicketBadgeContextValue | null>(null);

export function TicketBadgeProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.role === "student" ? currentUser.user_id : null;
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    const load = () => {
      getAllPages<BadgeTicket>("/tickets/")
        .then((rows) => countUnseen(userId, rows))
        .then(({ count }) => {
          if (!cancelled) setUnseenCount(count);
        })
        .catch(() => {
          // Offline or signed out meanwhile - keep the last count.
        });
    };
    load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [userId]);

  return (
    <TicketBadgeContext.Provider value={{ unseenCount: userId === null ? 0 : unseenCount, setUnseenCount }}>
      {children}
    </TicketBadgeContext.Provider>
  );
}

export function useTicketBadge() {
  const context = useContext(TicketBadgeContext);
  if (!context) {
    throw new Error("useTicketBadge must be used within a TicketBadgeProvider");
  }
  return context;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import axiosClient from "../lib/axiosClient";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  // Only set on assistant messages - identifies the InquiryLog this reply
  // came from, needed to submit thumbs up/down feedback on it.
  logId?: number;
  feedback?: "up" | "down" | null;
  // Only FAQ answers can be rated - not greetings, "rephrase" prompts, etc.
  canRate?: boolean;
  // Set when this reply created a ticket or pointed to an already-open one.
  ticketId?: number;
  ticketTitle?: string;
  ticketCode?: string;
  // True when the ticket is just the record of a ChatDesk answer (not with
  // staff) - the student can still ask for staff follow-up on it.
  ticketAiResolved?: boolean;
  // FAQ questions offered when the bot asks the student to clarify.
  suggestions?: string[];
};

export type Office = { office_id: number; name: string };

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
};

const TITLE_MAX_LENGTH = 40;

function makeTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((item) => item.role === "user")?.text ?? "New chat";
  return firstUserMessage.length > TITLE_MAX_LENGTH
    ? `${firstUserMessage.slice(0, TITLE_MAX_LENGTH)}...`
    : firstUserMessage;
}

type ChatContextValue = {
  messages: ChatMessage[];
  history: ChatSession[];
  isSending: boolean;
  offices: Office[];
  selectedOffice: Office | null;
  setSelectedOffice: (office: Office | null) => void;
  sendMessage: (text: string) => Promise<void>;
  submitFeedback: (logId: number, feedback: "up" | "down") => Promise<void>;
  requestStaffFollowUp: (ticketId: number) => Promise<boolean>;
  startNewChat: () => void;
  resumeSession: (sessionId: string) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<ChatSession[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<Office | null>(null);

  // The category/office picker on the chat screen - fetched once per
  // logged-in session. Any authenticated role (including students) can read
  // this list per offices/permissions.py.
  useEffect(() => {
    if (!currentUser) {
      setOffices([]);
      return;
    }
    (async () => {
      try {
        const { data } = await axiosClient.get("/offices/");
        setOffices(data.results ?? data);
      } catch {
        setOffices([]);
      }
    })();
  }, [currentUser]);

  // Keyed per-user so one student's chat history never shows up for
  // another student logging into the same device.
  const storageKey = currentUser ? `chatdesk_chat_history_${currentUser.user_id}` : null;

  useEffect(() => {
    setMessages([]);
    setHistory([]);
    if (!storageKey) return;
    (async () => {
      const stored = await AsyncStorage.getItem(storageKey);
      if (!stored) return;
      try {
        setHistory(JSON.parse(stored));
      } catch {
        // Corrupted local cache - ignore and start fresh.
      }
    })();
  }, [storageKey]);

  const persistHistory = async (next: ChatSession[]) => {
    setHistory(next);
    if (storageKey) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    // Earlier turns of this chat so the backend can tell a follow-up
    // ("is that all?") from a new, unanswerable question.
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setIsSending(true);
    try {
      const { data } = await axiosClient.post(
        "/chat/ask/",
        {
          message: trimmed,
          history,
          ...(selectedOffice ? { office: selectedOffice.office_id } : {}),
        },
        // Longer than the app-wide 15s: the backend gives OpenAI 15s plus one
        // retry, so a slow reply can take ~30s. Cutting it off sooner showed
        // "Can't reach ChatDesk" while the server was still answering.
        { timeout: 45000 }
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          logId: data.log_id,
          feedback: null,
          canRate: Boolean(data.is_answer),
          ...(data.ticket_id
            ? {
                ticketId: data.ticket_id,
                ticketTitle: data.ticket_title,
                ticketCode: data.ticket_code,
                ticketAiResolved: Boolean(data.ticket_ai_resolved),
              }
            : {}),
          ...(data.suggested_questions?.length ? { suggestions: data.suggested_questions } : {}),
        },
      ]);
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      let text = "Can't reach ChatDesk right now. Please check your connection and try again.";
      if (error.code === "ECONNABORTED") {
        text = "ChatDesk is taking longer than usual to answer. Please try again in a moment.";
      } else if (status === 429) {
        text = "You're sending messages too quickly. Please wait a moment and try again.";
      } else if (status === 400 && data?.details?.message?.[0]) {
        text = data.details.message[0];
      } else if (status === 401) {
        text = "Your session expired. Please log in again.";
      }
      setMessages((prev) => [...prev, { role: "assistant", text }]);
    } finally {
      setIsSending(false);
    }
  };

  // "I still need help" on a ChatDesk answer: reopens that answer's ticket
  // for OSA staff (same ticket code), right from the chat.
  const requestStaffFollowUp = async (ticketId: number) => {
    try {
      await axiosClient.post(`/tickets/${ticketId}/follow-up/`);
    } catch (error: any) {
      // Already with staff (e.g. requested from the Tickets tab) - fine.
      if (error.response?.status !== 400) return false;
    }
    setMessages((prev) =>
      prev.map((m) => (m.ticketId === ticketId ? { ...m, ticketAiResolved: false } : m))
    );
    return true;
  };

  const submitFeedback = async (logId: number, feedback: "up" | "down") => {
    // Optimistic update - the vote UI shouldn't wait on the network round
    // trip, and a failure here isn't worth surfacing to the student.
    setMessages((prev) =>
      prev.map((m) => (m.logId === logId ? { ...m, feedback } : m))
    );
    try {
      await axiosClient.patch(`/chat/logs/${logId}/feedback/`, { feedback });
    } catch {
      // Non-critical - the student's vote just won't be recorded server-side.
    }
  };

  const startNewChat = () => {
    if (messages.length > 0) {
      const session: ChatSession = {
        id: Date.now().toString(),
        title: makeTitle(messages),
        messages,
        updatedAt: new Date().toISOString(),
      };
      persistHistory([session, ...history]);
    }
    setMessages([]);
    setSelectedOffice(null);
  };

  const resumeSession = (sessionId: string) => {
    const session = history.find((item) => item.id === sessionId);
    if (!session) return;

    let nextHistory = history.filter((item) => item.id !== sessionId);
    if (messages.length > 0) {
      const currentSession: ChatSession = {
        id: Date.now().toString(),
        title: makeTitle(messages),
        messages,
        updatedAt: new Date().toISOString(),
      };
      nextHistory = [currentSession, ...nextHistory];
    }

    persistHistory(nextHistory);
    setMessages(session.messages);
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        history,
        isSending,
        offices,
        selectedOffice,
        setSelectedOffice,
        sendMessage,
        submitFeedback,
        requestStaffFollowUp,
        startNewChat,
        resumeSession,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

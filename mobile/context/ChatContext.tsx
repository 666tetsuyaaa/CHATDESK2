import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { getAllPages } from "../lib/allPages";
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
  // A connection or server error shown in the chat. Never sent to the
  // backend as conversation context and never saved to History.
  isError?: boolean;
};

export type Office = { office_id: number; name: string };

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
};

const TITLE_MAX_LENGTH = 40;

// What gets saved and sent as context: the real conversation, not errors.
const realMessages = (messages: ChatMessage[]) => messages.filter((m) => !m.isError);

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
        setOffices(await getAllPages<Office>("/offices/"));
      } catch {
        setOffices([]);
      }
    })();
  }, [currentUser]);

  // Keyed per-user so one student's chat history never shows up for
  // another student logging into the same device.
  const storageKey = currentUser ? `chatdesk_chat_history_${currentUser.user_id}` : null;
  // The chat in progress, saved as it happens so closing the app doesn't
  // lose it. It moves into History on "New chat" or when an older chat is
  // opened, as before.
  const currentChatKey = currentUser ? `chatdesk_current_chat_${currentUser.user_id}` : null;
  // Which user's saved chat has been restored - nothing is saved until then,
  // or the empty start-up state would overwrite the saved chat.
  const restoredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    restoredKeyRef.current = null;
    setMessages([]);
    setHistory([]);
    if (!storageKey || !currentChatKey) return;
    (async () => {
      try {
        const [storedHistory, storedCurrent] = await Promise.all([
          AsyncStorage.getItem(storageKey),
          AsyncStorage.getItem(currentChatKey),
        ]);
        if (storedHistory) setHistory(JSON.parse(storedHistory));
        if (storedCurrent) setMessages(JSON.parse(storedCurrent));
      } catch {
        // Corrupted local cache - ignore and start fresh.
      } finally {
        restoredKeyRef.current = currentChatKey;
      }
    })();
  }, [storageKey, currentChatKey]);

  useEffect(() => {
    if (!currentChatKey || restoredKeyRef.current !== currentChatKey) return;
    AsyncStorage.setItem(currentChatKey, JSON.stringify(realMessages(messages))).catch(() => {
      // Non-critical - the chat just won't survive an app restart.
    });
  }, [messages, currentChatKey]);

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
    const history = realMessages(messages)
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

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
      setMessages((prev) => [...prev, { role: "assistant", text, isError: true }]);
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
    const saved = realMessages(messages);
    if (saved.length > 0) {
      const session: ChatSession = {
        id: Date.now().toString(),
        title: makeTitle(saved),
        messages: saved,
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
    const saved = realMessages(messages);
    if (saved.length > 0) {
      const currentSession: ChatSession = {
        id: Date.now().toString(),
        title: makeTitle(saved),
        messages: saved,
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

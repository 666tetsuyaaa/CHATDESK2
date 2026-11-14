import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { getAllPages } from "../lib/allPages";
import axiosClient from "../lib/axiosClient";
import { freshReplies } from "../lib/freshReplies";

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
  // When one message asked several things: the question this reply answers
  // (shown above it).
  question?: string;
  // A connection or server error shown in the chat. Never sent to the
  // backend as conversation context and never saved to History.
  isError?: boolean;
  // On an error caused by the connection or the server (not by the message
  // itself): the question to send again from the "Try again" button.
  retryText?: string;
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

const sameMessages = (a: ChatMessage[], b: ChatMessage[]) => JSON.stringify(a) === JSON.stringify(b);

function makeTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((item) => item.role === "user")?.text ?? "New chat";
  return firstUserMessage.length > TITLE_MAX_LENGTH
    ? `${firstUserMessage.slice(0, TITLE_MAX_LENGTH)}...`
    : firstUserMessage;
}

type ChatContextValue = {
  messages: ChatMessage[];
  history: ChatSession[];
  // The History entry of the chat on screen (highlighted in the side menu);
  // null for a new chat that has no messages yet.
  activeSessionId: string | null;
  isSending: boolean;
  offices: Office[];
  selectedOffice: Office | null;
  setSelectedOffice: (office: Office | null) => void;
  sendMessage: (text: string) => Promise<void>;
  // Sends a failed question again, replacing it and its error message.
  retryMessage: (errorMessage: ChatMessage) => Promise<void>;
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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
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
  // Which History entry the chat on screen is (so it stays highlighted and
  // keeps updating the same entry after the app is reopened).
  const activeChatKey = currentUser ? `chatdesk_active_chat_${currentUser.user_id}` : null;
  // Which user's saved chat has been restored - nothing is saved until then,
  // or the empty start-up state would overwrite the saved chat.
  const restoredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    restoredKeyRef.current = null;
    setMessages([]);
    setHistory([]);
    setActiveSessionId(null);
    if (!storageKey || !currentChatKey || !activeChatKey) return;
    (async () => {
      try {
        const [storedHistory, storedCurrent, storedActive] = await Promise.all([
          AsyncStorage.getItem(storageKey),
          AsyncStorage.getItem(currentChatKey),
          AsyncStorage.getItem(activeChatKey),
        ]);
        if (storedHistory) setHistory(JSON.parse(storedHistory));
        if (storedCurrent) {
          const current = JSON.parse(storedCurrent) as ChatMessage[];
          setMessages(current);
          // A chat saved by an older version has no History entry yet - give it one.
          if (current.length > 0) setActiveSessionId(storedActive || Date.now().toString());
        }
      } catch {
        // Corrupted local cache - ignore and start fresh.
      } finally {
        restoredKeyRef.current = currentChatKey;
      }
    })();
  }, [storageKey, currentChatKey, activeChatKey]);

  useEffect(() => {
    if (!currentChatKey || restoredKeyRef.current !== currentChatKey) return;
    AsyncStorage.setItem(currentChatKey, JSON.stringify(realMessages(messages))).catch(() => {
      // Non-critical - the chat just won't survive an app restart.
    });
  }, [messages, currentChatKey]);

  // History as shown: the saved chats, with the chat on screen kept up to
  // date in its own entry (moved to the top when it gets new messages, like
  // ChatGPT). Opening a chat from History doesn't change it, so it stays
  // where it is - highlighted.
  const liveHistory = useMemo(() => {
    const saved = realMessages(messages);
    if (!activeSessionId || saved.length === 0) return history;
    const existing = history.find((session) => session.id === activeSessionId);
    if (existing && sameMessages(existing.messages, saved)) return history;
    const entry: ChatSession = {
      id: activeSessionId,
      title: makeTitle(saved),
      messages: saved,
      updatedAt: new Date().toISOString(),
    };
    return [entry, ...history.filter((session) => session.id !== activeSessionId)];
  }, [history, activeSessionId, messages]);

  useEffect(() => {
    if (!storageKey || !activeChatKey || restoredKeyRef.current !== currentChatKey) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(liveHistory)).catch(() => {});
    if (activeSessionId) AsyncStorage.setItem(activeChatKey, activeSessionId).catch(() => {});
    else AsyncStorage.removeItem(activeChatKey).catch(() => {});
  }, [liveHistory, activeSessionId, storageKey, activeChatKey, currentChatKey]);

  // `base` replaces the chat before the question is added (used by retry,
  // to drop the failed attempt); otherwise the question is appended.
  const ask = async (trimmed: string, base: ChatMessage[] | null) => {
    // Earlier turns of this chat so the backend can tell a follow-up
    // ("is that all?") from a new, unanswerable question.
    const history = realMessages(base ?? messages)
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.question ? `${m.question}\n${m.text}` : m.text }));

    // A new chat gets its History entry with its first message.
    if (!activeSessionId) setActiveSessionId(Date.now().toString());
    setMessages((prev) => [...(base ?? prev), { role: "user", text: trimmed }]);
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
      // One reply per question asked (a message can ask up to 3 things).
      const parts: any[] = data.parts?.length ? data.parts : [data];
      const replies: ChatMessage[] = parts.map((part) => ({
        role: "assistant",
        text: part.reply,
        logId: part.log_id,
        feedback: null,
        canRate: Boolean(part.is_answer),
        ...(part.question ? { question: part.question } : {}),
        ...(part.ticket_id
          ? {
              ticketId: part.ticket_id,
              ticketTitle: part.ticket_title,
              ticketCode: part.ticket_code,
              ticketAiResolved: Boolean(part.ticket_ai_resolved),
            }
          : {}),
        ...(part.suggested_questions?.length ? { suggestions: part.suggested_questions } : {}),
      }));
      // More than 3 questions: says the rest need a new message.
      if (data.note) replies.push({ role: "assistant", text: data.note });
      // Shown word by word once (see components/revealing-answer.tsx).
      replies.forEach((reply) => freshReplies.add(reply));
      setMessages((prev) => [...prev, ...replies]);
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
      // No reply at all, a timeout, a busy server or too many messages: the
      // same question can simply be sent again.
      const canRetry = !error.response || error.code === "ECONNABORTED" || status === 429 || status >= 500;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text, isError: true, ...(canRetry ? { retryText: trimmed } : {}) },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    await ask(trimmed, null);
  };

  const retryMessage = async (errorMessage: ChatMessage) => {
    const index = messages.indexOf(errorMessage);
    if (isSending || !errorMessage.retryText || index < 0) return;
    // Drop the error and the failed question just before it; ask again.
    const failedQuestion = index - 1;
    const base = messages.filter(
      (message, i) =>
        i !== index && !(i === failedQuestion && message.role === "user" && message.text === errorMessage.retryText)
    );
    await ask(errorMessage.retryText, base);
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

  // The chat on screen is already in History (see liveHistory), so a new
  // chat just starts empty.
  const startNewChat = () => {
    setHistory(liveHistory);
    setActiveSessionId(null);
    setMessages([]);
    setSelectedOffice(null);
  };

  // Opens a chat from History. It stays in the list (highlighted as the one
  // on screen); the chat that was open stays there too.
  const resumeSession = (sessionId: string) => {
    const session = liveHistory.find((item) => item.id === sessionId);
    if (!session) return;
    setHistory(liveHistory);
    setActiveSessionId(sessionId);
    setMessages(session.messages);
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        history: liveHistory,
        activeSessionId,
        isSending,
        offices,
        selectedOffice,
        setSelectedOffice,
        sendMessage,
        retryMessage,
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

import type { ChatMessage } from "../context/ChatContext";

// Replies that have just arrived and haven't been revealed word by word yet
// (see components/revealing-answer.tsx). Holds the message objects
// themselves, so a reply is revealed once - not again when the list redraws,
// and never for chats reopened from History (those are new objects).
const fresh = new WeakSet<ChatMessage>();

export const freshReplies = {
  add: (message: ChatMessage) => fresh.add(message),
  has: (message: ChatMessage) => fresh.has(message),
  done: (message: ChatMessage) => fresh.delete(message),
};

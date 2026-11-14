import AsyncStorage from "@react-native-async-storage/async-storage";
import axiosClient from "./axiosClient";
import type { ChatMessage, ChatSession } from "../context/ChatContext";

/**
 * History is kept on the server (per student) so it is the same in every
 * browser and phone. This phone still keeps a copy so History opens at once
 * and works offline; changes made offline wait here until they can be sent.
 */
export type SyncState = {
  // Chats changed here and not yet saved to the server.
  saves: string[];
  // Chats deleted here and not yet deleted on the server.
  deletes: string[];
  // The chats this browser saved before History moved to the server have
  // been copied up (done once).
  copied: boolean;
};

const syncKey = (userId: number) => `chatdesk_history_sync_${userId}`;

export async function loadSyncState(userId: number): Promise<SyncState> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(syncKey(userId))) ?? "null");
    if (saved && Array.isArray(saved.saves) && Array.isArray(saved.deletes)) {
      return { saves: saved.saves, deletes: saved.deletes, copied: Boolean(saved.copied) };
    }
  } catch {
    // Unreadable - start over; the copy-up runs again but never overwrites.
  }
  return { saves: [], deletes: [], copied: false };
}

export function storeSyncState(userId: number, state: SyncState) {
  AsyncStorage.setItem(syncKey(userId), JSON.stringify(state)).catch(() => {});
}

type ServerSession = { id: string; title: string; messages: ChatMessage[]; updated_at: string };

export async function fetchSessions(): Promise<ChatSession[] | null> {
  try {
    const { data } = await axiosClient.get<ServerSession[]>("/chat/sessions/");
    return data.map((s) => ({ id: s.id, title: s.title, messages: s.messages, updatedAt: s.updated_at }));
  } catch {
    return null;
  }
}

/** Saves one chat. onlyIfNew: keep the server's copy if it already has one. */
export async function uploadSession(session: ChatSession, onlyIfNew = false): Promise<boolean> {
  try {
    await axiosClient.put(
      `/chat/sessions/${encodeURIComponent(session.id)}/${onlyIfNew ? "?only_if_new=1" : ""}`,
      { title: session.title, messages: session.messages.filter((m) => !m.isError) }
    );
    return true;
  } catch (error: any) {
    // Refused as invalid (400): retrying won't help - count it as done.
    return error?.response?.status === 400;
  }
}

export async function deleteRemoteSession(id: string): Promise<boolean> {
  try {
    await axiosClient.delete(`/chat/sessions/${encodeURIComponent(id)}/`);
    return true;
  } catch (error: any) {
    return error?.response?.status === 404;
  }
}

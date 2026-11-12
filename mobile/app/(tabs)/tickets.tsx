import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavMenu } from "../../components/nav-menu";
import { FormattedAnswer } from "../../components/formatted-answer";
import { PressableScale } from "../../components/pressable-scale";
import { SkeletonTicketRow } from "../../components/skeleton";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTicketBadge } from "../../context/TicketBadgeContext";
import { getAllPages } from "../../lib/allPages";
import { useWebKeyboardInset } from "../../lib/keyboard";
import axiosClient from "../../lib/axiosClient";
import { formatDuration, formatManila, staffResolutionSeconds } from "../../lib/dates";
import { countUnseen, hasUnreadStaffMessage, readJson, seenMessagesKey, seenTicketsKey } from "../../lib/ticketBadge";
import type { ThemePalette } from "../../theme/colors";

type Ticket = {
  ticket_id: number;
  ticket_code: string;
  title: string;
  subject_category: string;
  issue_description: string;
  status: string;
  resolution: string | null;
  is_ai_resolved: boolean;
  created_at: string;
  reopened_at: string | null;
  resolved_at: string | null;
  // ChatDesk's earlier answer, once a chatbot-answered ticket moved to staff.
  chatbot_answer?: string | null;
  message_count?: number;
  last_staff_message_at?: string | null;
};

type TicketMessage = {
  message_id: number;
  sender_role: "student" | "staff";
  sender_name: string;
  body: string;
  created_at: string;
};

type TicketFilter = "staff" | "ai";

const MESSAGE_MAX_LENGTH = 2000;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "In Progress",
  resolved: "Resolved",
};

// issue_description is 'Student asked: "..." - <outcome>.' - show the question only.
const ISSUE_PATTERN = /^Student asked: "([\s\S]*)" - (?:AI could not resolve|Answered by ChatDesk)\.$/;

function displayQuestion(issueDescription: string) {
  return ISSUE_PATTERN.exec(issueDescription)?.[1] ?? issueDescription;
}

export default function TicketsScreen() {
  const { currentUser, logout } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { setUnseenCount } = useTicketBadge();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Every ChatDesk answer is also a ticket now - kept on its own tab so the
  // tickets with OSA staff don't get buried.
  const [filter, setFilter] = useState<TicketFilter>("staff");
  const [isRequestingFollowUp, setIsRequestingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [threadFailed, setThreadFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [nativeKeyboardHeight, setKeyboardHeight] = useState(0);
  // The web app gets no keyboard events, so there the height is measured
  // from the browser instead (see lib/keyboard.ts).
  const webKeyboardHeight = useWebKeyboardInset();
  const keyboardHeight = Platform.OS === "web" ? webKeyboardHeight : nativeKeyboardHeight;
  const [seenMessages, setSeenMessages] = useState<Record<string, string>>({});
  const modalScrollRef = useRef<ScrollViewInstance>(null);

  const userInitial = currentUser?.first_name?.[0]?.toUpperCase() ?? "?";
  const staffTickets = tickets?.filter((t) => !t.is_ai_resolved) ?? [];
  const aiTickets = tickets?.filter((t) => t.is_ai_resolved) ?? [];
  const visibleTickets = filter === "staff" ? staffTickets : aiTickets;

  const updateBadgeFromTickets = async (rows: Ticket[]) => {
    if (!currentUser) return;
    const { count, seenAt } = await countUnseen(currentUser.user_id, rows);
    setSeenMessages(seenAt);
    setUnseenCount(count);
  };

  // Lift the ticket card above the keyboard while replying (same approach
  // as the chat screen - see the comment there).
  useEffect(() => {
    const isIOS = Platform.OS === "ios";
    const showSub = Keyboard.addListener(isIOS ? "keyboardWillShow" : "keyboardDidShow", (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(isIOS ? "keyboardWillHide" : "keyboardDidHide", () =>
      setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadThread = async (ticketId: number) => {
    setThreadFailed(false);
    try {
      const { data } = await axiosClient.get<TicketMessage[]>(`/tickets/${ticketId}/messages/`);
      setThread(data);
    } catch {
      setThreadFailed(true);
    }
  };

  const markMessagesSeen = async (ticket: Ticket) => {
    if (!currentUser || !ticket.last_staff_message_at) return;
    const key = seenMessagesKey(currentUser.user_id);
    const seenAt = await readJson<Record<string, string>>(key, {});
    seenAt[String(ticket.ticket_id)] = new Date().toISOString();
    setSeenMessages({ ...seenAt });
    try {
      await AsyncStorage.setItem(key, JSON.stringify(seenAt));
    } catch {
      // Non-critical: the badge just stays until the next successful write.
    }
    if (tickets) updateBadgeFromTickets(tickets);
  };

  // The student reopened a resolved ticket: forget that its answer was seen,
  // so staff's next answer lights up the tab badge again.
  const forgetSeenResolution = async (ticketId: number) => {
    if (!currentUser) return;
    const key = seenTicketsKey(currentUser.user_id);
    const seenIds = await readJson<number[]>(key, []);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(seenIds.filter((id) => id !== ticketId)));
    } catch {
      // Non-critical: only the badge for this ticket's next answer is missed.
    }
  };

  const handleSendReply = async () => {
    const ticket = viewingTicket;
    const body = reply.trim();
    if (!ticket || !body || isSendingReply) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setReplyError(null);
    setIsSendingReply(true);
    try {
      const { data } = await axiosClient.post<TicketMessage>(`/tickets/${ticket.ticket_id}/messages/`, { body });
      setThread((prev) => [...prev, data]);
      setReply("");
      // A reply sends the ticket back to staff (and reopens it if resolved).
      setViewingTicket({ ...ticket, status: "pending", resolved_at: null });
      if (ticket.status === "resolved") await forgetSeenResolution(ticket.ticket_id);
      loadTickets();
      requestAnimationFrame(() => modalScrollRef.current?.scrollToEnd({ animated: true }));
    } catch (error: any) {
      setReplyError(
        error.response?.data?.details?.body?.[0] ??
          error.response?.data?.message ??
          "Couldn't send your message. Please try again."
      );
    } finally {
      setIsSendingReply(false);
    }
  };

  const closeTicket = () => {
    Keyboard.dismiss();
    setViewingTicket(null);
  };

  const loadTickets = async () => {
    try {
      // Every page, so older tickets (and the unread badge, which counts
      // them) aren't cut off at 20.
      const rows = await getAllPages<Ticket>("/tickets/");
      setTickets(rows);
      setLoadFailed(false);
      updateBadgeFromTickets(rows);
    } catch {
      setLoadFailed(true);
    }
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tab stays mounted, so reload whenever it is opened (new tickets
  // from the chat) and when the app comes back to the foreground (staff
  // may have replied meanwhile) - that keeps the list and badge current.
  useFocusEffect(
    useCallback(() => {
      loadTickets();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") loadTickets();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTickets();
    setIsRefreshing(false);
  };

  const handleFollowUp = async (ticket: Ticket) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFollowUpError(null);
    setIsRequestingFollowUp(true);
    try {
      const { data } = await axiosClient.post<Ticket>(`/tickets/${ticket.ticket_id}/follow-up/`);
      setViewingTicket(data);
      setFilter("staff");
      loadTickets();
    } catch (error: any) {
      setFollowUpError(error.response?.data?.message ?? "Couldn't reach OSA staff. Please try again.");
    } finally {
      setIsRequestingFollowUp(false);
    }
  };

  const handleView = async (ticket: Ticket) => {
    Haptics.selectionAsync().catch(() => {});
    setFollowUpError(null);
    setReplyError(null);
    setReply("");
    setThread([]);
    setViewingTicket(ticket);
    if (!ticket.is_ai_resolved) loadThread(ticket.ticket_id);
    markMessagesSeen(ticket);

    // Only a resolved ticket counts as seen - otherwise viewing it while
    // pending would stop the badge from ever showing its resolution.
    if (!currentUser || ticket.status !== "resolved") return;
    try {
      const key = seenTicketsKey(currentUser.user_id);
      const stored = await AsyncStorage.getItem(key);
      const seenIds: number[] = stored ? JSON.parse(stored) : [];
      if (!seenIds.includes(ticket.ticket_id)) {
        const next = [...seenIds, ticket.ticket_id];
        await AsyncStorage.setItem(key, JSON.stringify(next));
        if (tickets) updateBadgeFromTickets(tickets);
      }
    } catch {
      // Badge just won't clear for this ticket until next successful write - non-critical.
    }
  };

  // Set by the chat's "View Ticket" button. The tab stays mounted, so this
  // runs on every new ticketId, then clears it so it won't reopen later.
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  useEffect(() => {
    if (!ticketId) return;
    (async () => {
      try {
        const { data } = await axiosClient.get<Ticket>(`/tickets/${ticketId}/`);
        handleView(data);
      } catch {
        // Not found or not this student's ticket - just show the list.
      }
      loadTickets();
      router.setParams({ ticketId: undefined });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => setIsMenuOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <MaterialIcons name="menu" size={26} color={colors.accentText} />
        </PressableScale>
        <Text style={styles.title}>Tickets</Text>
        <PressableScale
          onPress={() => router.push("/profile")}
          hitSlop={12}
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          {currentUser?.profile_picture ? (
            <Image source={{ uri: currentUser.profile_picture }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{userInitial}</Text>
          )}
        </PressableScale>
      </View>

      <View style={styles.filterRow} accessibilityRole="tablist">
        {(
          [
            { key: "staff", label: "Needs staff", count: staffTickets.length },
            { key: "ai", label: "Answered by ChatDesk", count: aiTickets.length },
          ] as const
        ).map((option) => {
          const isActive = filter === option.key;
          return (
            <PressableScale
              key={option.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setFilter(option.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {option.label}
                {tickets ? ` (${option.count})` : ""}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {loadFailed ? (
        <ScrollView
          contentContainerStyle={styles.centerStateContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accentText} />}
        >
          <Text style={styles.centerState}>
            {"Can't load your tickets right now - pull down to try again."}
          </Text>
        </ScrollView>
      ) : tickets === null ? (
        <View>
          <View style={styles.columnHeaderRow}>
            <Text style={[styles.columnHeader, styles.labelColumn]} />
            <Text style={[styles.columnHeader, styles.statusColumn]}>Status</Text>
            <Text style={[styles.columnHeader, styles.actionColumn]}>Action</Text>
          </View>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonTicketRow key={i} />
          ))}
        </View>
      ) : visibleTickets.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyStateContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accentText} />}
        >
          <View style={styles.emptyIconCircle}>
            <MaterialIcons
              name={filter === "staff" ? "check-circle-outline" : "chat-bubble-outline"}
              size={36}
              color={colors.accentText}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === "staff" ? "You're all caught up" : "No ChatDesk answers yet"}
          </Text>
          <Text style={styles.centerState}>
            {filter === "staff"
              ? "No tickets with OSA staff right now - ask ChatDesk anything to get started."
              : "Questions ChatDesk answers instantly are saved here as tickets."}
          </Text>
        </ScrollView>
      ) : (
        <>
          <View style={styles.columnHeaderRow}>
            <Text style={[styles.columnHeader, styles.labelColumn]} />
            <Text style={[styles.columnHeader, styles.statusColumn]}>Status</Text>
            <Text style={[styles.columnHeader, styles.actionColumn]}>Action</Text>
          </View>
          {/* FlatList only draws the rows on screen, so long ticket lists
              scroll without stutter. */}
          <FlatList
            data={visibleTickets}
            keyExtractor={(ticket) => String(ticket.ticket_id)}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accentText} />}
            renderItem={({ item: ticket }) => {
              const isResolved = ticket.status === "resolved";
              const hasNewReply = hasUnreadStaffMessage(ticket, seenMessages);
              const statusColor =
                  ticket.status === "active" ? colors.statusActive : isResolved ? colors.statusResolved : colors.statusPending;
              return (
                <PressableScale
                  style={styles.row}
                  pressedScale={0.985}
                  onPress={() => handleView(ticket)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ticket.title}, ticket ${ticket.ticket_code}, ${
                    ticket.is_ai_resolved ? "answered by ChatDesk" : STATUS_LABELS[ticket.status] ?? ticket.status
                  }${hasNewReply ? ", new reply" : ""}. Open ticket`}
                >
                  <View style={styles.labelColumn}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {ticket.title}
                    </Text>
                    {hasNewReply ? (
                      <View style={styles.newReplyPill}>
                        <Text style={styles.newReplyText}>New reply</Text>
                      </View>
                    ) : null}
                    <Text style={styles.rowNumber}>{ticket.ticket_code}</Text>
                    <Text style={styles.rowDate}>{formatManila(ticket.created_at)}</Text>
                  </View>
                  <View style={styles.statusColumn}>
                    {isResolved ? (
                      <MaterialIcons name="check-circle" size={22} color={statusColor} />
                    ) : (
                      <View style={styles.statusPill}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {STATUS_LABELS[ticket.status] ?? "Pending"}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* The whole row opens the ticket; the button is the visible cue. */}
                  <View style={styles.actionColumn} importantForAccessibility="no-hide-descendants">
                    <View style={styles.viewButton}>
                      <Text style={styles.viewButtonText}>View</Text>
                    </View>
                  </View>
                </PressableScale>
              );
            }}
          />
        </>
      )}

      <Modal
        visible={viewingTicket !== null}
        transparent
        animationType="fade"
        onRequestClose={closeTicket}
      >
        <Pressable
          style={[
            styles.modalBackdrop,
            keyboardHeight > 0 && { justifyContent: "flex-end", paddingBottom: keyboardHeight + 12 },
          ]}
          onPress={closeTicket}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {viewingTicket ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalEyebrow}>{viewingTicket.ticket_code}</Text>
                    <Text style={styles.modalTitle}>{viewingTicket.title}</Text>
                  </View>
                  <View style={styles.modalStatusBadge}>
                    <MaterialIcons
                      name={viewingTicket.status === "resolved" ? "check-circle" : "schedule"}
                      size={14}
                      color={colors.accentText}
                    />
                    <Text style={styles.modalStatusText}>
                      {viewingTicket.is_ai_resolved
                        ? "Answered by ChatDesk"
                        : STATUS_LABELS[viewingTicket.status] ?? viewingTicket.status}
                    </Text>
                  </View>
                  <PressableScale
                    onPress={closeTicket}
                    hitSlop={12}
                    style={styles.modalCloseIcon}
                    accessibilityRole="button"
                    accessibilityLabel="Close ticket"
                  >
                    <MaterialIcons name="close" size={22} color={colors.textSecondary} />
                  </PressableScale>
                </View>

                <ScrollView
                  ref={modalScrollRef}
                  style={styles.modalBody}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.modalSectionLabel}>You asked</Text>
                  <Text style={styles.modalSectionText}>{displayQuestion(viewingTicket.issue_description)}</Text>

                  {/* A chatbot answer that moved to staff keeps showing what
                      ChatDesk said first. */}
                  {!viewingTicket.is_ai_resolved && viewingTicket.chatbot_answer ? (
                    <>
                      <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>ChatDesk&apos;s answer</Text>
                      <FormattedAnswer text={viewingTicket.chatbot_answer} style={styles.modalSectionText} />
                    </>
                  ) : null}

                  {/* The answer shows once there is one. Until then, the
                      conversation below is where staff reply. */}
                  {/* A reopened ticket keeps staff's earlier answer, shown as such. */}
                  {viewingTicket.resolution ? (
                    <>
                      <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>
                        {viewingTicket.is_ai_resolved
                          ? "ChatDesk's answer"
                          : viewingTicket.status === "resolved"
                            ? "Final answer"
                            : "Earlier answer"}
                      </Text>
                      <FormattedAnswer text={viewingTicket.resolution} style={styles.modalSectionText} />
                    </>
                  ) : !viewingTicket.is_ai_resolved && thread.length === 0 && !threadFailed ? (
                    <Text style={styles.waitingNote}>
                      OSA staff will reply here. You&apos;ll also get an email when they do.
                    </Text>
                  ) : null}

                  <View style={styles.timeline}>
                    <TimelineRow styles={styles} label="Submitted" value={formatManila(viewingTicket.created_at)} />
                    {viewingTicket.reopened_at ? (
                      <TimelineRow
                        styles={styles}
                        label="Moved to staff"
                        value={formatManila(viewingTicket.reopened_at)}
                      />
                    ) : null}
                    {viewingTicket.resolved_at ? (
                      <TimelineRow
                        styles={styles}
                        label={viewingTicket.is_ai_resolved ? "Answered" : "Resolved"}
                        value={formatManila(viewingTicket.resolved_at)}
                      />
                    ) : null}
                    {viewingTicket.resolved_at && !viewingTicket.is_ai_resolved ? (
                      <TimelineRow
                        styles={styles}
                        label="Resolved in"
                        value={formatDuration(staffResolutionSeconds(viewingTicket))}
                      />
                    ) : null}
                  </View>

                  {!viewingTicket.is_ai_resolved && (thread.length > 0 || threadFailed) ? (
                    <View style={styles.thread}>
                      <Text style={styles.modalSectionLabel}>Messages</Text>
                      {threadFailed ? (
                        <Pressable onPress={() => loadThread(viewingTicket.ticket_id)} accessibilityRole="button">
                          <Text style={styles.followUpError}>{"Couldn't load messages. Tap to try again."}</Text>
                        </Pressable>
                      ) : (
                        thread.map((message) => {
                          const mine = message.sender_role === "student";
                          return (
                            <View
                              key={message.message_id}
                              style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleStaff]}
                            >
                              <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.body}</Text>
                              <Text style={[styles.bubbleMeta, mine && styles.bubbleMetaMine]}>
                                {mine ? "You" : message.sender_name} · {formatManila(message.created_at)}
                              </Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  ) : null}

                  {viewingTicket.is_ai_resolved ? (
                    <View style={styles.followUpBox}>
                      <Text style={styles.followUpText}>
                        Didn&apos;t fully answer your question? OSA staff can follow up on this same ticket.
                      </Text>
                      <Pressable
                        style={({ pressed }) => [styles.followUpButton, pressed && styles.followUpButtonPressed]}
                        onPress={() => handleFollowUp(viewingTicket)}
                        disabled={isRequestingFollowUp}
                        accessibilityRole="button"
                        accessibilityLabel="I still need help - send this to OSA staff"
                      >
                        {isRequestingFollowUp ? (
                          <ActivityIndicator size="small" color={colors.accentText} />
                        ) : (
                          <Text style={styles.followUpButtonText}>I still need help</Text>
                        )}
                      </Pressable>
                      {followUpError ? <Text style={styles.followUpError}>{followUpError}</Text> : null}
                    </View>
                  ) : null}
                </ScrollView>

                {!viewingTicket.is_ai_resolved ? (
                  <View style={styles.replyBox}>
                    {viewingTicket.status === "resolved" ? (
                      <Text style={styles.replyHint}>Still need help? Sending a message reopens this ticket.</Text>
                    ) : null}
                    <View style={styles.replyRow}>
                      <TextInput
                        value={reply}
                        onChangeText={setReply}
                        placeholder="Message OSA staff..."
                        placeholderTextColor={colors.textMuted}
                        style={styles.replyInput}
                        multiline
                        maxLength={MESSAGE_MAX_LENGTH}
                        accessibilityLabel="Message to OSA staff"
                        onFocus={() =>
                          setTimeout(() => modalScrollRef.current?.scrollToEnd({ animated: true }), 250)
                        }
                      />
                      <PressableScale
                        style={[styles.replySend, (!reply.trim() || isSendingReply) && styles.replySendDisabled]}
                        onPress={handleSendReply}
                        disabled={!reply.trim() || isSendingReply}
                        accessibilityRole="button"
                        accessibilityLabel="Send message"
                      >
                        {isSendingReply ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <MaterialIcons name="send" size={18} color={reply.trim() ? colors.white : colors.textMuted} />
                        )}
                      </PressableScale>
                    </View>
                    {replyError ? <Text style={styles.followUpError}>{replyError}</Text> : null}
                  </View>
                ) : null}

              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <NavMenu
        visible={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        userInitial={userInitial}
        onLogout={logout}
      />
    </SafeAreaView>
  );
}

function TimelineRow({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text style={styles.timelineValue}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    filterChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
      backgroundColor: colors.surface,
    },
    filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    filterChipText: { fontFamily: "Montserrat_700Bold", fontSize: 12, color: colors.textSecondary },
    filterChipTextActive: { color: colors.white },
    rowDate: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    newReplyPill: {
      alignSelf: "flex-start",
      marginTop: 4,
      backgroundColor: colors.gold,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    newReplyText: { fontFamily: "Montserrat_700Bold", fontSize: 10, color: "#1B2A6B" },
    thread: { marginTop: 16, gap: 8 },
    bubble: { maxWidth: "88%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleStaff: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.accent, borderBottomRightRadius: 4 },
    bubbleText: { fontFamily: "Montserrat_400Regular", fontSize: 14, lineHeight: 19, color: colors.textPrimary },
    bubbleTextMine: { color: colors.white },
    bubbleMeta: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: colors.textMuted, marginTop: 3 },
    bubbleMetaMine: { color: "rgba(255,255,255,0.75)" },
    replyBox: { gap: 6 },
    replyHint: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: colors.textSecondary },
    replyRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    replyInput: {
      flex: 1,
      maxHeight: 110,
      minHeight: 42,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      fontFamily: "Montserrat_400Regular",
      fontSize: 14,
      color: colors.textPrimary,
    },
    replySend: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    replySendDisabled: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.border },
    modalCloseIcon: { padding: 2, marginLeft: -4 },
    waitingNote: {
      marginTop: 16,
      fontFamily: "Montserrat_400Regular",
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    timeline: {
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 6,
    },
    timelineRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    timelineLabel: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: colors.textMuted },
    timelineValue: {
      flexShrink: 1,
      textAlign: "right",
      fontFamily: "Montserrat_700Bold",
      fontSize: 12,
      color: colors.textPrimary,
    },
    followUpBox: {
      marginTop: 16,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    followUpText: { fontFamily: "Montserrat_400Regular", fontSize: 13, lineHeight: 18, color: colors.textSecondary },
    followUpButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: colors.accentText,
      borderRadius: 16,
      paddingVertical: 7,
      paddingHorizontal: 14,
      minHeight: 34,
      justifyContent: "center",
    },
    followUpButtonPressed: { opacity: 0.7 },
    followUpButtonText: { fontFamily: "Montserrat_700Bold", fontSize: 13, color: colors.accentText },
    followUpError: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: colors.errorRed },
    screen: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    title: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", color: colors.textPrimary },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.accentText,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    avatarImage: { width: 30, height: 30 },
    avatarText: { fontFamily: "Montserrat_700Bold", color: colors.accentText, fontSize: 12 },
    centerStateContainer: { flexGrow: 1, justifyContent: "center" },
    centerState: {
      marginTop: 8,
      textAlign: "center",
      color: colors.textSecondary,
      fontFamily: "Montserrat_400Regular",
      fontSize: 14,
      paddingHorizontal: 24,
    },
    emptyStateContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.accent + "1A",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    emptyTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 17,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    columnHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    columnHeader: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 15,
      color: colors.textPrimary,
      textAlign: "center",
    },
    labelColumn: { flex: 1.6 },
    statusColumn: { flex: 1, alignItems: "center" },
    actionColumn: { flex: 0.85, alignItems: "center" },
    statusPill: { flexDirection: "row", alignItems: "center", gap: 5 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontFamily: "Montserrat_700Bold", fontSize: 13 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowTitle: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: colors.textPrimary },
    rowNumber: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    pendingText: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: colors.textSecondary },
    viewButton: {
      borderWidth: 1,
      borderColor: colors.textPrimary,
      borderRadius: 16,
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    viewButtonText: { fontFamily: "Montserrat_700Bold", fontSize: 13, color: colors.textPrimary },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 420,
      maxHeight: "75%",
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 16,
    },
    modalHeaderText: { flex: 1 },
    modalEyebrow: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 2,
    },
    modalTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 19,
      color: colors.textPrimary,
    },
    modalStatusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accent + "1A",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    modalStatusText: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 12,
      color: colors.accentText,
    },
    modalBody: { marginBottom: 16 },
    modalSectionLabel: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    modalSectionLabelSpaced: { marginTop: 16 },
    modalSectionText: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 15,
      lineHeight: 21,
      color: colors.textPrimary,
    },
  });

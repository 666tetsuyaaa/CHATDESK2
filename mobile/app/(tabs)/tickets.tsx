import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavMenu } from "../../components/nav-menu";
import { PressableScale } from "../../components/pressable-scale";
import { SkeletonTicketRow } from "../../components/skeleton";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTicketBadge } from "../../context/TicketBadgeContext";
import axiosClient from "../../lib/axiosClient";
import { formatDuration, formatManila, staffResolutionSeconds } from "../../lib/dates";
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
};

type TicketFilter = "staff" | "ai";

const seenTicketsKey = (userId: number) => `chatdesk_seen_resolved_tickets_${userId}`;

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

  const userInitial = currentUser?.first_name?.[0]?.toUpperCase() ?? "?";
  const staffTickets = tickets?.filter((t) => !t.is_ai_resolved) ?? [];
  const aiTickets = tickets?.filter((t) => t.is_ai_resolved) ?? [];
  const visibleTickets = filter === "staff" ? staffTickets : aiTickets;

  const updateBadgeFromTickets = async (rows: Ticket[]) => {
    if (!currentUser) return;
    let seenIds: number[] = [];
    try {
      const stored = await AsyncStorage.getItem(seenTicketsKey(currentUser.user_id));
      seenIds = stored ? JSON.parse(stored) : [];
    } catch {
      seenIds = [];
    }
    const seenSet = new Set(seenIds);
    // Only staff replies are news - ChatDesk answers were already seen in chat.
    const unseen = rows.filter(
      (t) => t.status === "resolved" && !t.is_ai_resolved && !seenSet.has(t.ticket_id)
    ).length;
    setUnseenCount(unseen);
  };

  const loadTickets = async () => {
    try {
      // The endpoint pages 20 at a time - follow `next` so older tickets (and
      // the unread badge, which counts them) aren't silently cut off.
      const rows: Ticket[] = [];
      let nextUrl: string | null = "/tickets/";
      while (nextUrl) {
        const { data }: { data: { results?: Ticket[]; next?: string | null } | Ticket[] } =
          await axiosClient.get(nextUrl);
        if (Array.isArray(data)) {
          rows.push(...data);
          break;
        }
        rows.push(...(data.results ?? []));
        nextUrl = data.next ?? null;
      }
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
    setViewingTicket(ticket);

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
              return (
                <View style={styles.row}>
                  <View style={styles.labelColumn}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {ticket.title}
                    </Text>
                    <Text style={styles.rowNumber}>{ticket.ticket_code}</Text>
                    <Text style={styles.rowDate}>{formatManila(ticket.created_at)}</Text>
                  </View>
                  <View style={styles.statusColumn}>
                    {isResolved ? (
                      <MaterialIcons
                        name="check"
                        size={20}
                        color={colors.textPrimary}
                        accessibilityLabel={ticket.is_ai_resolved ? "Answered by ChatDesk" : "Resolved"}
                      />
                    ) : (
                      <Text style={styles.pendingText}>{STATUS_LABELS[ticket.status] ?? "Pending"}</Text>
                    )}
                  </View>
                  <View style={styles.actionColumn}>
                    <PressableScale
                      style={styles.viewButton}
                      onPress={() => handleView(ticket)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${ticket.title}, ticket ${ticket.ticket_code}`}
                    >
                      <Text style={styles.viewButtonText}>View</Text>
                    </PressableScale>
                  </View>
                </View>
              );
            }}
          />
        </>
      )}

      <Modal
        visible={viewingTicket !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingTicket(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setViewingTicket(null)}>
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
                </View>

                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalSectionLabel}>You asked</Text>
                  <Text style={styles.modalSectionText}>{displayQuestion(viewingTicket.issue_description)}</Text>

                  <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>
                    {viewingTicket.is_ai_resolved ? "ChatDesk's answer" : "Staff answer"}
                  </Text>
                  <Text style={styles.modalSectionText}>
                    {viewingTicket.resolution ?? "Waiting for a staff response."}
                  </Text>

                  <View style={styles.timeline}>
                    <TimelineRow styles={styles} label="Submitted" value={formatManila(viewingTicket.created_at)} />
                    {viewingTicket.reopened_at ? (
                      <TimelineRow
                        styles={styles}
                        label="Sent to staff"
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

                  {viewingTicket.is_ai_resolved ? (
                    <View style={styles.followUpBox}>
                      <Text style={styles.followUpText}>
                        Didn't fully answer your question? OSA staff can follow up on this same ticket.
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

                <PressableScale style={styles.modalCloseButton} onPress={() => setViewingTicket(null)}>
                  <Text style={styles.modalCloseButtonText}>Close</Text>
                </PressableScale>
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
    rowDate: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: colors.textMuted, marginTop: 1 },
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
    labelColumn: { flex: 1.1 },
    statusColumn: { flex: 1, alignItems: "center" },
    actionColumn: { flex: 1, alignItems: "center" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowTitle: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: colors.textPrimary },
    rowNumber: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: colors.textMuted, marginTop: 2 },
    pendingText: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: colors.textSecondary },
    viewButton: {
      borderWidth: 1,
      borderColor: colors.textPrimary,
      borderRadius: 16,
      paddingVertical: 6,
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
    modalCloseButton: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: "center",
    },
    modalCloseButtonText: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 15,
      color: colors.white,
    },
  });

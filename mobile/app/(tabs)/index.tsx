import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ScrollViewInstance } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { BotAvatar } from "../../components/bot-avatar";
import { BrandTitle } from "../../components/brand-title";
import { NavMenu } from "../../components/nav-menu";
import { TypingDots } from "../../components/typing-dots";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { useTheme } from "../../context/ThemeContext";
import axiosClient from "../../lib/axiosClient";
import { colors as brandColors, type ThemePalette } from "../../theme/colors";

// Only shown when the backend has no FAQs to suggest yet.
const FALLBACK_SUGGESTED_QUESTIONS = [
  "How do I apply for a scholarship?",
  "What are the enrollment requirements?",
  "How do I get my clearance signed?",
];

type Phase = {
  phase_id: number | null;
  name: string | null;
  guidance_message: string;
  suggested_questions: string[];
};

export default function StudentChatScreen() {
  const { currentUser, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors);
  const {
    messages,
    isSending,
    sendMessage,
    submitFeedback,
    requestStaffFollowUp,
    offices,
    selectedOffice,
    setSelectedOffice,
    startNewChat,
  } = useChat();
  const [followUpTicketId, setFollowUpTicketId] = useState<number | null>(null);

  const handleNeedHelp = async (ticketId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFollowUpTicketId(ticketId);
    const ok = await requestStaffFollowUp(ticketId);
    setFollowUpTicketId(null);
    if (!ok) {
      Alert.alert("Couldn't reach OSA staff", "Please check your connection and try again.");
    }
  };
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<Phase | null>(null);
  const [isPhaseBannerDismissed, setIsPhaseBannerDismissed] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(FALLBACK_SUGGESTED_QUESTIONS);

  const userInitial = currentUser?.first_name?.[0]?.toUpperCase() ?? "?";
  const hasActivePhase = phase !== null && phase.phase_id !== null && phase.name !== null;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axiosClient.get<Phase>("/phases/current/");
        setPhase(data);
      } catch {
        setPhase(null);
      }
    })();
  }, []);

  // Refetched every time the welcome screen is shown (tab focus, "New chat",
  // office change) since the tab stays mounted and the ranking shifts as
  // students keep asking.
  const isChatEmpty = messages.length === 0;
  const selectedOfficeId = selectedOffice?.office_id;
  useFocusEffect(
    useCallback(() => {
      if (!isChatEmpty) return;
      (async () => {
        try {
          const { data } = await axiosClient.get<{ faq_id: number; question_text: string }[]>("/faqs/popular/", {
            params: selectedOfficeId ? { office: selectedOfficeId } : {},
          });
          setSuggestedQuestions(
            data.length > 0 ? data.map((faq) => faq.question_text) : FALLBACK_SUGGESTED_QUESTIONS
          );
        } catch {
          setSuggestedQuestions(FALLBACK_SUGGESTED_QUESTIONS);
        }
      })();
    }, [isChatEmpty, selectedOfficeId])
  );

  // Not KeyboardAvoidingView - its automatic height/padding measurement is
  // unreliable once this screen lives inside expo-router's Tabs navigator
  // (the input bar was ending up completely hidden behind the keyboard).
  // Tracking the keyboard height directly and applying it as padding sidesteps
  // that ancestor-height-chain ambiguity entirely.
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessage("");
    sendMessage(trimmed);
  };

  const handleNewChat = () => {
    Haptics.selectionAsync().catch(() => {});
    setMessage("");
    startNewChat();
  };

  const canSend = message.trim().length > 0 && !isSending;
  // Falls back to the initial when the photo URL is set but won't load.
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.surface, colors.surface, colors.accent]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => setIsMenuOpen(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressedIcon]}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <MaterialIcons name="menu" size={22} color={colors.accentText} />
          </Pressable>
          <BrandTitle style={styles.title} chatColor={isDark ? brandColors.white : brandColors.navy} />
          <View style={styles.headerRight}>
            {!isChatEmpty ? (
              <Pressable
                onPress={handleNewChat}
                hitSlop={8}
                style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressedIcon]}
                accessibilityRole="button"
                accessibilityLabel="Start a new chat"
              >
                <MaterialIcons name="edit-note" size={22} color={colors.accentText} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.push("/profile")}
              hitSlop={12}
              style={({ pressed }) => [styles.avatar, pressed && styles.pressedIcon]}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              {currentUser?.profile_picture && failedAvatarUri !== currentUser.profile_picture ? (
                <Image
                  source={{ uri: currentUser.profile_picture }}
                  style={styles.avatarImage}
                  onError={() => setFailedAvatarUri(currentUser.profile_picture ?? null)}
                />
              ) : (
                <Text style={styles.avatarText}>{userInitial}</Text>
              )}
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.categoryChip, pressed && styles.categoryChipPressed]}
          onPress={() => setIsCategoryPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={selectedOffice ? `Category: ${selectedOffice.name}` : "Choose a category"}
        >
          <MaterialIcons name="apartment" size={14} color={colors.gold} />
          <Text style={styles.categoryChipText} numberOfLines={1}>
            {selectedOffice ? selectedOffice.name : "All offices"}
          </Text>
          <MaterialIcons name="expand-more" size={16} color={colors.textMuted} />
        </Pressable>

        <Modal
          visible={isCategoryPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsCategoryPickerOpen(false)}
        >
          <Pressable style={styles.categoryModalBackdrop} onPress={() => setIsCategoryPickerOpen(false)}>
            <View style={styles.categoryModalSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.categoryModalHeading}>Ask about which office?</Text>
              <FlatList
                data={[{ office_id: null as number | null, name: "General / Not sure" }, ...offices]}
                keyExtractor={(option) => String(option.office_id)}
                renderItem={({ item }) => {
                  const isSelected = item.office_id === (selectedOffice?.office_id ?? null);
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.categoryModalOption,
                        isSelected && styles.categoryModalOptionSelected,
                        pressed && styles.categoryChipPressed,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSelectedOffice(item.office_id === null ? null : { office_id: item.office_id, name: item.name });
                        setIsCategoryPickerOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={item.name}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.categoryModalOptionText, isSelected && styles.categoryModalOptionTextSelected]}>
                        {item.name}
                      </Text>
                      {isSelected ? <MaterialIcons name="check-circle" size={18} color={colors.gold} /> : null}
                    </Pressable>
                  );
                }}
              />
            </View>
          </Pressable>
        </Modal>

        {hasActivePhase && !isPhaseBannerDismissed && phase ? (
          <View style={styles.phaseBanner}>
            <View style={styles.phaseBannerIcon}>
              <MaterialIcons name="event" size={16} color={colors.gold} />
            </View>
            <View style={styles.phaseBannerText}>
              <Text style={styles.phaseBannerTitle}>{phase.name}</Text>
              {phase.guidance_message ? (
                <Text style={styles.phaseBannerMessage}>{phase.guidance_message}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setIsPhaseBannerDismissed(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss phase banner"
            >
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.body, { paddingBottom: keyboardHeight }]}>
          {messages.length === 0 ? (
            <Animated.View entering={FadeIn.duration(400)} style={styles.welcomeBlock}>
              <BotAvatar size={64} />
              <Text style={styles.welcomeGreeting}>Hi, {currentUser?.first_name ?? "there"} 👋</Text>
              <Text style={styles.welcomeTitle}>What can I help with?</Text>
              <Text style={styles.welcomeSubtitle}>
                Ask about enrollment, scholarships, clearance and other student services.
              </Text>
            </Animated.View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              // Fires when the keyboard (or a growing input) shrinks the
              // visible area - content size alone doesn't change then.
              onLayout={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.map((item, index) => (
                <Animated.View key={index} entering={FadeInDown.duration(280)}>
                  {item.role === "user" ? (
                    <View style={[styles.messageBubble, styles.messageBubbleUser]}>
                      <Text style={styles.messageTextUser}>{item.text}</Text>
                    </View>
                  ) : (
                    <View style={styles.assistantRow}>
                      <BotAvatar size={28} />
                      <View style={[styles.messageBubble, styles.messageBubbleAssistant]}>
                        <Text style={styles.messageTextAssistant}>{item.text}</Text>
                      </View>
                    </View>
                  )}
                  {item.role === "assistant" && item.logId && item.canRate ? (
                    <View style={styles.feedbackRow}>
                      <Pressable
                        style={[styles.feedbackButton, item.feedback === "up" && styles.feedbackButtonActive]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          submitFeedback(item.logId!, "up");
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Mark this answer as helpful"
                        accessibilityState={{ selected: item.feedback === "up" }}
                      >
                        <MaterialIcons
                          name={item.feedback === "up" ? "thumb-up" : "thumb-up-off-alt"}
                          size={15}
                          color={item.feedback === "up" ? colors.accentText : colors.textMuted}
                        />
                      </Pressable>
                      <Pressable
                        style={[styles.feedbackButton, item.feedback === "down" && styles.feedbackButtonActive]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          submitFeedback(item.logId!, "down");
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Mark this answer as not helpful"
                        accessibilityState={{ selected: item.feedback === "down" }}
                      >
                        <MaterialIcons
                          name={item.feedback === "down" ? "thumb-down" : "thumb-down-off-alt"}
                          size={15}
                          color={item.feedback === "down" ? colors.errorRed : colors.textMuted}
                        />
                      </Pressable>
                      {item.feedback ? (
                        <Text style={styles.feedbackThanksText}>Thanks for your feedback</Text>
                      ) : null}
                      {item.ticketId && item.ticketAiResolved ? (
                        <Pressable
                          style={({ pressed }) => [styles.needHelpPill, pressed && styles.categoryChipPressed]}
                          onPress={() => handleNeedHelp(item.ticketId!)}
                          disabled={followUpTicketId === item.ticketId}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Still need help? Send this question to OSA staff"
                        >
                          {followUpTicketId === item.ticketId ? (
                            <ActivityIndicator size="small" color={colors.accentText} />
                          ) : (
                            <>
                              <MaterialIcons name="support-agent" size={14} color={colors.accentText} />
                              <Text style={styles.needHelpText}>Still need help?</Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {/* A ticket with OSA staff: escalations, repeats, and ChatDesk
                      answers the student asked staff to follow up on. */}
                  {item.role === "assistant" && item.ticketId && !item.ticketAiResolved ? (
                    <View style={styles.ticketCard}>
                      <View style={styles.ticketCardHeader}>
                        <View style={styles.ticketCardIcon}>
                          <MaterialIcons name="confirmation-number" size={16} color={colors.gold} />
                        </View>
                        <View style={styles.ticketCardHeaderText}>
                          <Text style={styles.ticketRowLabel} numberOfLines={2}>
                            {item.ticketTitle ?? "General Inquiry"}
                          </Text>
                          <Text style={styles.ticketCode}>{item.ticketCode ?? `Ticket #${item.ticketId}`}</Text>
                        </View>
                      </View>
                      {item.canRate ? (
                        <Text style={styles.ticketRowHint}>Sent to OSA staff - they'll reply in your Tickets.</Text>
                      ) : null}
                      <Pressable
                        style={({ pressed }) => [styles.viewTicketButton, pressed && styles.viewTicketButtonPressed]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          router.push({ pathname: "/tickets", params: { ticketId: String(item.ticketId) } });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`View ticket ${item.ticketCode ?? item.ticketId}`}
                      >
                        <Text style={styles.viewTicketButtonText}>View Ticket</Text>
                        <MaterialIcons name="arrow-forward" size={15} color={colors.white} />
                      </Pressable>
                    </View>
                  ) : null}
                  {/* Only on the latest reply - older suggestions are stale once the student moves on. */}
                  {item.suggestions && index === messages.length - 1 && !isSending ? (
                    <View style={[styles.chipsRow, styles.clarifyChipsRow]}>
                      {item.suggestions.map((question) => (
                        <Pressable
                          key={question}
                          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            sendMessage(question);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Ask: ${question}`}
                        >
                          <Text style={styles.chipText}>{question}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </Animated.View>
              ))}
              {isSending ? (
                <Animated.View entering={FadeIn.duration(200)} style={styles.assistantRow}>
                  <BotAvatar size={28} />
                  <View style={[styles.messageBubble, styles.messageBubbleAssistant, styles.typingBubble]}>
                    <TypingDots color={colors.accentText} />
                  </View>
                </Animated.View>
              ) : null}
            </ScrollView>
          )}

          {messages.length === 0 ? (
            <View style={styles.suggestions}>
              {suggestedQuestions.map((question, index) => (
                <Animated.View key={question} entering={FadeInDown.delay(120 + index * 70).duration(320)}>
                  <Pressable
                    style={({ pressed }) => [styles.suggestionCard, pressed && styles.suggestionCardPressed]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setMessage(question);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Use suggestion: ${question}`}
                  >
                    <MaterialIcons name="auto-awesome" size={16} color={colors.gold} />
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {question}
                    </Text>
                    <MaterialIcons name="north-east" size={16} color={colors.white} style={styles.suggestionChevron} />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ) : null}

          {isChatEmpty && hasActivePhase && phase && phase.suggested_questions.length > 0 ? (
            <View style={styles.chipsRow}>
              {phase.suggested_questions.map((question) => (
                <Pressable
                  key={question}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    sendMessage(question);
                  }}
                  disabled={isSending}
                >
                  <Text style={styles.chipText}>{question}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Message ChatDesk..."
              placeholderTextColor={colors.textMuted}
              value={message}
              onChangeText={setMessage}
              // Matches the backend's chat message cap.
              maxLength={1000}
              multiline
              // Native: the keyboard's send key submits instead of adding a newline.
              submitBehavior="submit"
              onSubmitEditing={handleSend}
              // Web: react-native-web ignores submitBehavior, so Enter sends
              // here and Shift+Enter still adds a newline.
              onKeyPress={
                Platform.OS === "web"
                  ? (e) => {
                      const event = e as unknown as { key: string; shiftKey?: boolean; preventDefault: () => void };
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSend();
                      }
                    }
                  : undefined
              }
              returnKeyType="send"
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}
              onPress={handleSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !canSend }}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={brandColors.navy} />
              ) : (
                <MaterialIcons name="arrow-upward" size={20} color={brandColors.navy} />
              )}
            </Pressable>
          </View>
          {keyboardHeight === 0 ? (
            <Text style={styles.disclaimer}>ChatDesk can make mistakes. Check important info with OSA.</Text>
          ) : null}
        </View>

        <NavMenu
          visible={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          userInitial={userInitial}
          onLogout={logout}
        />
      </SafeAreaView>
    </View>
  );
}

// Assistant content (feedback row, ticket card, chips) lines up with the
// bubble text rather than the avatar: 28px avatar + 8px gap.
const ASSISTANT_INDENT = 36;

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    root: { flex: 1 },
    screen: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    headerIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    pressedIcon: { opacity: 0.5 },
    title: { fontSize: 20 },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      borderColor: colors.gold,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    avatarImage: { width: 34, height: 34 },
    avatarText: { fontFamily: "Montserrat_700Bold", color: colors.accentText, fontSize: 13 },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "center",
      gap: 6,
      maxWidth: "80%",
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipPressed: { opacity: 0.7 },
    categoryChipText: {
      flexShrink: 1,
      fontFamily: "Montserrat_700Bold",
      fontSize: 12,
      color: colors.textPrimary,
    },
    categoryModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    categoryModalSheet: {
      maxHeight: "65%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 10,
      paddingBottom: 24,
    },
    sheetHandle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 14,
    },
    categoryModalHeading: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 17,
      color: colors.textPrimary,
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    categoryModalOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 14,
    },
    categoryModalOptionSelected: { backgroundColor: `${colors.accentText}14` },
    categoryModalOptionText: {
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    categoryModalOptionTextSelected: {
      fontFamily: "Montserrat_700Bold",
      color: colors.accentText,
    },
    phaseBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 12,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    phaseBannerIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(245,166,35,0.15)",
    },
    phaseBannerText: { flex: 1 },
    phaseBannerTitle: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 14,
      color: colors.accentText,
      marginBottom: 2,
    },
    phaseBannerMessage: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    body: { flex: 1, paddingHorizontal: 16 },
    welcomeBlock: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
    welcomeGreeting: {
      marginTop: 16,
      fontFamily: "Montserrat_700Bold",
      fontSize: 15,
      color: colors.textSecondary,
    },
    welcomeTitle: {
      marginTop: 4,
      fontSize: 28,
      lineHeight: 36,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.textPrimary,
      textAlign: "center",
    },
    welcomeSubtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Montserrat_400Regular",
      color: colors.textSecondary,
      textAlign: "center",
    },
    messageList: { flex: 1 },
    messageListContent: { paddingVertical: 12, gap: 14 },
    assistantRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    messageBubble: {
      borderRadius: 20,
      paddingHorizontal: 15,
      paddingVertical: 11,
      maxWidth: "82%",
    },
    messageBubbleUser: {
      backgroundColor: colors.accent,
      alignSelf: "flex-end",
      borderBottomRightRadius: 6,
    },
    messageBubbleAssistant: {
      flexShrink: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 6,
    },
    typingBubble: { paddingVertical: 14, paddingHorizontal: 18 },
    messageTextUser: { color: colors.white, fontFamily: "Montserrat_400Regular", fontSize: 15, lineHeight: 21 },
    messageTextAssistant: {
      color: colors.textPrimary,
      fontFamily: "Montserrat_400Regular",
      fontSize: 15,
      lineHeight: 22,
    },
    feedbackRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
      paddingLeft: ASSISTANT_INDENT,
    },
    feedbackButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    feedbackButtonActive: { borderColor: colors.accentText },
    feedbackThanksText: {
      marginLeft: 4,
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    needHelpPill: {
      marginLeft: "auto",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      minHeight: 30,
      paddingHorizontal: 12,
      borderRadius: 15,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    needHelpText: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 12,
      color: colors.accentText,
    },
    ticketCard: {
      alignSelf: "flex-start",
      marginLeft: ASSISTANT_INDENT,
      maxWidth: "82%",
      gap: 10,
      marginTop: 8,
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    ticketCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    ticketCardIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(245,166,35,0.15)",
    },
    ticketCardHeaderText: { flexShrink: 1 },
    ticketRowLabel: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 14,
      color: colors.textPrimary,
    },
    ticketCode: {
      marginTop: 1,
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    ticketRowHint: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    viewTicketButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    viewTicketButtonPressed: { opacity: 0.8 },
    viewTicketButtonText: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 13,
      color: colors.white,
    },
    suggestions: { paddingBottom: 12, gap: 8 },
    suggestionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: 16,
      // Brand-navy glass, so the white text stays readable even where the
      // background gradient is still light (top card in light mode).
      backgroundColor: `${colors.accent}CC`,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)",
    },
    suggestionCardPressed: { backgroundColor: colors.accent },
    suggestionText: {
      flex: 1,
      fontFamily: "Montserrat_400Regular",
      fontSize: 14,
      lineHeight: 19,
      color: colors.white,
    },
    suggestionChevron: { opacity: 0.6 },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingBottom: 12,
    },
    chip: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipPressed: { opacity: 0.6 },
    clarifyChipsRow: { marginTop: 8, paddingBottom: 4, paddingLeft: ASSISTANT_INDENT },
    chipText: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 13,
      color: colors.textPrimary,
    },
    // Single rounded "pill" holding the input and the send button, like the
    // composer in modern AI chat apps.
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      marginTop: 6,
      marginBottom: 6,
      paddingLeft: 16,
      paddingRight: 6,
      paddingVertical: 6,
      borderRadius: 26,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    },
    input: {
      flex: 1,
      // Explicit top/bottom - iOS ignores paddingVertical on multiline inputs.
      paddingTop: 9,
      paddingBottom: 9,
      minHeight: 40,
      maxHeight: 120,
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.gold,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: { opacity: 0.4 },
    sendButtonPressed: { transform: [{ scale: 0.94 }] },
    disclaimer: {
      textAlign: "center",
      fontFamily: "Montserrat_400Regular",
      fontSize: 11,
      color: "rgba(255,255,255,0.6)",
      marginBottom: 6,
    },
  });

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { KeyboardEvent, ScrollViewInstance, TextInputInstance } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { BotAvatar } from "../../components/bot-avatar";
import { FloatingLogo } from "../../components/floating-logo";
import { BrandTitle } from "../../components/brand-title";
import { NavMenu } from "../../components/nav-menu";
import { PressableScale } from "../../components/pressable-scale";
import { RevealingAnswer } from "../../components/revealing-answer";
import { TypingDots } from "../../components/typing-dots";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { useTheme } from "../../context/ThemeContext";
import axiosClient from "../../lib/axiosClient";
import { freshReplies } from "../../lib/freshReplies";
import {
  KEYBOARD_DISMISS_MODE,
  KEYBOARD_REST_ATTRIBUTE,
  isTouchScreen,
  useWebKeyboard,
  webHomeIndicatorHeight,
} from "../../lib/keyboard";
import { MOTION } from "../../lib/motion";
import { TAB_BAR_HEIGHT, useTabBarHeight } from "../../lib/tabBar";
import { colors as brandColors, type ThemePalette } from "../../theme/colors";
import { useInstallHint } from "../../lib/installHint";
import { WebHitArea } from "../../components/web-hit-area";

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

const DISCLAIMER_MARGIN = 6;

// Web: tapping Send mustn't take the focus from the message box. Moving the
// focus rearranged the screen in the middle of the tap (the keyboard started
// closing), so the button moved away before the tap finished. The message is
// sent first; then the keyboard closes on its own (see handleSend).
function keepTypingFocus(node: unknown) {
  if (Platform.OS !== "web" || !node) return;
  (node as HTMLElement).onmousedown = (event) => event.preventDefault();
}

export default function StudentChatScreen() {
  const { currentUser, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors);
  const {
    messages,
    isSending,
    sendMessage,
    retryMessage,
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
  const [nativeKeyboardHeight, setKeyboardHeight] = useState(0);
  // The web app gets no keyboard events, so there the height is measured
  // from the browser instead (see lib/keyboard.ts).
  const webKeyboard = useWebKeyboard();
  const keyboardHeight = Platform.OS === "web" ? webKeyboard.inset : nativeKeyboardHeight;
  const isKeyboardOpen = Platform.OS === "web" ? webKeyboard.open : nativeKeyboardHeight > 0;
  // The tab bar floats over this screen (and hides while typing).
  const tabBarHeight = useTabBarHeight();
  // The disclaimer under the message box (hidden while typing), with its margin.
  const [disclaimerSpace, setDisclaimerSpace] = useState(0);
  // Web: the space below the message box at rest - the home-indicator area
  // (the screen's own bottom padding), the tab bar (which includes that area
  // again) and the disclaimer. While typing it stays the same, so the box
  // doesn't move when the keyboard starts to open; the app then reaches
  // behind the keyboard by up to this much (lib/keyboard.ts), so the box
  // stays still until the keyboard reaches it and then rides on it - and
  // back down when it closes - like chat apps. Fixed numbers, not the
  // safe-area values the layout library re-measures a moment after each
  // change (that made the box twitch).
  const restSpace = TAB_BAR_HEIGHT + 2 * webHomeIndicatorHeight() + disclaimerSpace;
  const webTypingSpace = Platform.OS === "web" && webKeyboard.open ? restSpace : null;
  // Web: the message box - Send closes the keyboard after sending, and the
  // keyboard handling reads its resting space from it.
  const inputRef = useRef<TextInputInstance>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    (inputRef.current as unknown as HTMLElement | null)?.setAttribute(KEYBOARD_REST_ATTRIBUTE, String(restSpace));
  }, [restSpace]);
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  // A reply taller than most of the screen is shown from its top, not its
  // end - the first steps of a long FAQ answer are the ones to read first.
  // A message asking several things gets several replies - the same applies
  // to all of them together, starting from the first.
  const listHeightRef = useRef(0);
  const longReplyIndexRef = useRef<number | null>(null);
  const replyLayoutsRef = useRef<{ start: number; layouts: Record<number, { y: number; height: number }> }>({
    start: -1,
    layouts: {},
  });
  // Index of the first reply to the latest question (messages.length while
  // that question is still waiting for its answer).
  const replyBatchStart = messages.map((m) => m.role).lastIndexOf("user") + 1;
  const [waitSeconds, setWaitSeconds] = useState(0);
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

  // Each office's most-asked questions, remembered once loaded, so switching
  // office shows its suggestions at once instead of waiting for the server.
  const popularCacheRef = useRef<Record<string, string[]>>({});
  const loadPopular = useCallback(async (officeId: number | null | undefined) => {
    const { data } = await axiosClient.get<{ faq_id: number; question_text: string }[]>("/faqs/popular/", {
      params: officeId ? { office: officeId } : {},
    });
    const questions = data.length > 0 ? data.map((faq) => faq.question_text) : FALLBACK_SUGGESTED_QUESTIONS;
    popularCacheRef.current[String(officeId ?? "")] = questions;
    return questions;
  }, []);
  // Fetches every office's suggestions in the background (when the office
  // list is opened), so whichever office is picked is ready.
  const prefetchPopular = () => {
    for (const officeId of [null, ...offices.map((office) => office.office_id)]) {
      if (!popularCacheRef.current[String(officeId ?? "")]) loadPopular(officeId).catch(() => {});
    }
  };
  // Switching office swaps the suggestions with a quick fade; the slower
  // one-by-one entrance is only for a fresh welcome screen.
  const [isOfficeSwitch, setIsOfficeSwitch] = useState(false);
  // Copy button under an answer: shows "Copied" for a moment.
  const [copiedMessage, setCopiedMessage] = useState<(typeof messages)[number] | null>(null);
  const copyAnswer = async (item: (typeof messages)[number]) => {
    try {
      await Clipboard.setStringAsync(item.text);
    } catch {
      return; // The browser refused (rare) - nothing was copied, so no "Copied".
    }
    Haptics.selectionAsync().catch(() => {});
    setCopiedMessage(item);
    setTimeout(() => setCopiedMessage((current) => (current === item ? null : current)), 1800);
  };
  const installHint = useInstallHint();
  // Small screens with the keyboard open (e.g. an iPhone SE in the browser
  // leaves ~260pt): the suggested questions step aside while typing if they
  // and the message box don't both fit, so the box is never pushed under the
  // keyboard. They come back when the keyboard closes. (Heights are only
  // measured while shown, so hiding them can't flip back and forth.)
  const [bodyHeight, setBodyHeight] = useState(0);
  const [suggestionsHeight, setSuggestionsHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);

  // Refetched every time the welcome screen is shown (tab focus, "New chat",
  // office change) since the tab stays mounted and the ranking shifts as
  // students keep asking. Remembered suggestions show at once meanwhile.
  const isChatEmpty = messages.length === 0;
  const selectedOfficeId = selectedOffice?.office_id;
  useFocusEffect(
    useCallback(() => {
      if (!isChatEmpty) return;
      const cached = popularCacheRef.current[String(selectedOfficeId ?? "")];
      if (cached) setSuggestedQuestions(cached);
      let cancelled = false;
      // Same questions as on screen: keep the current list (no re-render).
      const show = (questions: string[]) =>
        setSuggestedQuestions((prev) => (prev.join("\n") === questions.join("\n") ? prev : questions));
      loadPopular(selectedOfficeId)
        .then((questions) => {
          if (!cancelled) show(questions);
        })
        .catch(() => {
          if (!cancelled && !cached) show(FALLBACK_SUGGESTED_QUESTIONS);
        });
      // A quicker office switch must not be overwritten by a slower answer
      // for the previous office.
      return () => {
        cancelled = true;
      };
    }, [isChatEmpty, selectedOfficeId, loadPopular])
  );

  // Not KeyboardAvoidingView - its automatic height/padding measurement is
  // unreliable once this screen lives inside expo-router's Tabs navigator
  // (the input bar was ending up completely hidden behind the keyboard).
  // Tracking the keyboard height directly and applying it as padding sidesteps
  // that ancestor-height-chain ambiguity entirely.
  // iOS sends "will" events in step with the keyboard, so the input bar rises
  // and falls with it (same animation KeyboardAvoidingView uses) instead of
  // jumping once it lands. Android only has "did" events, so it eases there.
  useEffect(() => {
    const isIOS = Platform.OS === "ios";
    const animateWith = (e: KeyboardEvent) => {
      if (isIOS) {
        const duration = Math.max(e.duration, 10);
        LayoutAnimation.configureNext({
          duration,
          update: { duration, type: LayoutAnimation.Types[e.easing] ?? LayoutAnimation.Types.keyboard },
        });
      } else {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
    };
    const showSub = Keyboard.addListener(isIOS ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      animateWith(e);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(isIOS ? "keyboardWillHide" : "keyboardDidHide", (e) => {
      animateWith(e);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Counts how long the current reply has taken, for the waiting hint.
  useEffect(() => {
    if (!isSending) return;
    const started = Date.now();
    const timer = setInterval(() => setWaitSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setWaitSeconds(0);
    };
  }, [isSending]);
  const waitingHint = waitSeconds >= 12 ? "Almost there…" : waitSeconds >= 4 ? "Checking the FAQs…" : null;

  // The welcome greeting shrinks to fit the space left between the office
  // picker and the suggestion cards (less with the keyboard open, a phase
  // banner, or a small phone), instead of spilling over them:
  // 0 = full, 1 = smaller logo and no subtitle, 2 = greeting and title only,
  // 3 = nothing (no room at all). Each level's height is measured the first
  // time it is shown; until then it is estimated from the full height.
  const [welcomeSpace, setWelcomeSpace] = useState<number | null>(null);
  const [welcomeHeights, setWelcomeHeights] = useState<Record<number, number>>({});
  const levelHeight = (level: number) => {
    if (welcomeHeights[level]) return welcomeHeights[level];
    const full = welcomeHeights[0];
    if (!full) return null;
    return level === 1 ? full - 70 : full - 126; // subtitle and logo removed
  };
  let welcomeLevel = isKeyboardOpen ? 1 : 0;
  if (welcomeSpace !== null) {
    while (welcomeLevel < 3) {
      const needed = levelHeight(welcomeLevel);
      if (needed === null || needed <= welcomeSpace) break;
      welcomeLevel += 1;
    }
  }
  const recordWelcomeHeight = (height: number) => {
    if (welcomeLevel < 3 && Math.abs((welcomeHeights[welcomeLevel] ?? 0) - height) > 1) {
      setWelcomeHeights((prev) => ({ ...prev, [welcomeLevel]: height }));
    }
  };

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessage("");
    sendMessage(trimmed);
    // On a phone the keyboard closes after sending so the answer has room
    // (Send no longer takes the focus itself - see the Send button).
    if (Platform.OS === "web" && isTouchScreen()) inputRef.current?.blur();
  };

  const handleNewChat = () => {
    Haptics.selectionAsync().catch(() => {});
    setMessage("");
    setIsOfficeSwitch(false);
    startNewChat();
  };

  const canSend = message.trim().length > 0 && !isSending;
  const hideSuggestions =
    isKeyboardOpen && bodyHeight > 0 && suggestionsHeight > 0 && bodyHeight < suggestionsHeight + composerHeight + 24;
  // Falls back to the initial when the photo URL is set but won't load.
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.surface, colors.surface, colors.accent]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* While typing on the web, the bottom space is webTypingSpace instead. */}
      <SafeAreaView style={styles.screen} edges={webTypingSpace === null ? ["top", "bottom"] : ["top"]}>
        {/* Tapping anywhere that isn't a button or the text box closes the
            keyboard. Buttons inside still get their own taps first. Native
            only - on web this would blur the input on every click. */}
        <Pressable
          style={styles.screen}
          onPress={Platform.OS === "web" ? undefined : Keyboard.dismiss}
          accessible={false}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => setIsMenuOpen(true)}
              hitSlop={12}
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressedIcon]}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <WebHitArea slop={12} />
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
                  <WebHitArea slop={8} />
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
                <WebHitArea slop={12} />
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
            onPress={() => {
              setIsCategoryPickerOpen(true);
              prefetchPopular();
            }}
            accessibilityRole="button"
            accessibilityLabel={selectedOffice ? `Category: ${selectedOffice.name}` : "Choose a category"}
            hitSlop={8}
          >
            <WebHitArea slop={8} />
            <MaterialIcons name="apartment" size={14} color={colors.goldInk} />
            <Text style={styles.categoryChipText} numberOfLines={1}>
              {selectedOffice ? selectedOffice.name : "All offices"}
            </Text>
            <MaterialIcons name="expand-more" size={16} color={colors.textMuted} />
          </Pressable>

          {/* Opens with a quick fade and closes at once - the built-in fade
              took about 0.3s each way, so every pick felt slow. */}
          <Modal
            visible={isCategoryPickerOpen}
            transparent
            animationType="none"
            onRequestClose={() => setIsCategoryPickerOpen(false)}
          >
            <Animated.View entering={FadeIn.duration(MOTION.fast)} style={styles.categoryModalFill}>
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
                          setIsCategoryPickerOpen(false);
                          setIsOfficeSwitch(true);
                          setSelectedOffice(item.office_id === null ? null : { office_id: item.office_id, name: item.name });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={item.name}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={[styles.categoryModalOptionText, isSelected && styles.categoryModalOptionTextSelected]}>
                          {item.name}
                        </Text>
                        {isSelected ? <MaterialIcons name="check-circle" size={18} color={colors.goldInk} /> : null}
                      </Pressable>
                    );
                  }}
                />
              </View>
            </Pressable>
            </Animated.View>
          </Modal>

          {hasActivePhase && !isPhaseBannerDismissed && phase ? (
            <View style={styles.phaseBanner}>
              <View style={styles.phaseBannerIcon}>
                <MaterialIcons name="event" size={16} color={colors.goldInk} />
              </View>
              <View style={styles.phaseBannerText}>
                <Text style={styles.phaseBannerTitle}>{phase.name}</Text>
                {phase.guidance_message ? (
                  <Text style={styles.phaseBannerMessage}>{phase.guidance_message}</Text>
                ) : null}
              </View>
              <PressableScale
                onPress={() => setIsPhaseBannerDismissed(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss phase banner"
              >
                <MaterialIcons name="close" size={18} color={colors.textMuted} />
              </PressableScale>
            </View>
          ) : null}

          {/* iPhone web app: suggest adding ChatDesk to the Home Screen (opens
              like an app, without the browser bars). On the welcome screen
              only, and never together with the phase banner. */}
          {installHint.visible && isChatEmpty && !(hasActivePhase && !isPhaseBannerDismissed) ? (
            <Animated.View entering={FadeIn.duration(MOTION.base)} style={styles.phaseBanner}>
              <View style={styles.phaseBannerIcon}>
                <MaterialIcons name="ios-share" size={16} color={colors.goldInk} />
              </View>
              <View style={styles.phaseBannerText}>
                <Text style={styles.phaseBannerTitle}>Get the ChatDesk app</Text>
                <Text style={styles.phaseBannerMessage}>
                  {"Tap Share, then \u201cAdd to Home Screen\u201d to open ChatDesk like an app."}
                </Text>
              </View>
              <PressableScale
                onPress={installHint.dismiss}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close the Add to Home Screen tip"
              >
                <MaterialIcons name="close" size={18} color={colors.textMuted} />
              </PressableScale>
            </Animated.View>
          ) : null}

          <View
            style={[
              styles.body,
              { paddingBottom: webTypingSpace ?? (isKeyboardOpen ? keyboardHeight : tabBarHeight) },
            ]}
            onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
          >
            {messages.length === 0 ? (
              <Animated.View
                entering={FadeIn.duration(MOTION.slow)}
                style={styles.welcomeBlock}
                onLayout={(e) => setWelcomeSpace(e.nativeEvent.layout.height)}
              >
                {welcomeLevel < 3 ? (
                  <View style={styles.welcomeContent} onLayout={(e) => recordWelcomeHeight(e.nativeEvent.layout.height)}>
                    {welcomeLevel < 2 ? <FloatingLogo size={welcomeLevel === 0 ? 76 : 48} /> : null}
                    <Text style={[styles.welcomeGreeting, welcomeLevel === 2 && styles.welcomeGreetingTight]}>
                      Hi, {currentUser?.first_name ?? "there"} 👋
                    </Text>
                    <Text style={styles.welcomeTitle}>What can I help with?</Text>
                    {welcomeLevel === 0 ? (
                      <Text style={styles.welcomeSubtitle}>
                        Ask about enrollment, scholarships, clearance and other student services.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <ScrollView
                ref={scrollViewRef}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                showsVerticalScrollIndicator={false}
                // Taps on empty space close the keyboard, taps on buttons go
                // through on the first try, and dragging the chat closes it too.
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={KEYBOARD_DISMISS_MODE}
                onContentSizeChange={() => {
                  if (longReplyIndexRef.current === replyBatchStart && !isSending) return;
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }}
                // Fires when the keyboard (or a growing input) shrinks the
                // visible area - content size alone doesn't change then.
                onLayout={(e) => {
                  listHeightRef.current = e.nativeEvent.layout.height;
                  scrollViewRef.current?.scrollToEnd({ animated: false });
                }}
              >
                {messages.map((item, index) => (
                  <Animated.View
                    key={index}
                    entering={FadeInDown.duration(MOTION.base)}
                    onLayout={
                      index >= replyBatchStart && item.role === "assistant"
                        ? (e) => {
                            // The replies to the latest question (one per
                            // question asked): when together they're taller
                            // than most of the screen, start at the first.
                            const batch = replyLayoutsRef.current;
                            if (batch.start !== replyBatchStart) {
                              replyLayoutsRef.current = { start: replyBatchStart, layouts: {} };
                            }
                            const { layouts } = replyLayoutsRef.current;
                            layouts[index] = e.nativeEvent.layout;
                            const first = layouts[replyBatchStart];
                            const last = layouts[messages.length - 1];
                            if (!first || !last) return;
                            const height = last.y + last.height - first.y;
                            if (height > listHeightRef.current * 0.75 && longReplyIndexRef.current !== replyBatchStart) {
                              longReplyIndexRef.current = replyBatchStart;
                              requestAnimationFrame(() =>
                                scrollViewRef.current?.scrollTo({ y: Math.max(0, first.y - 8), animated: true })
                              );
                            }
                          }
                        : undefined
                    }
                  >
                    {item.role === "user" ? (
                      <View style={[styles.messageBubble, styles.messageBubbleUser]}>
                        <Text style={styles.messageTextUser}>{item.text}</Text>
                      </View>
                    ) : (
                      <View style={styles.assistantRow}>
                        <BotAvatar size={28} />
                        <View style={[styles.messageBubble, styles.messageBubbleAssistant]}>
                          {/* Which question this answers, when one message asked several. */}
                          {item.question ? <Text style={styles.answerQuestion}>{item.question}</Text> : null}
                          <RevealingAnswer
                            text={item.text}
                            animate={freshReplies.has(item)}
                            onRevealed={() => freshReplies.done(item)}
                            style={styles.messageTextAssistant}
                          />
                        </View>
                      </View>
                    )}
                    {/* Connection or server trouble: send the same question again. */}
                    {item.isError && item.retryText ? (
                      <View style={styles.feedbackRow}>
                        <PressableScale
                          style={styles.retryPill}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            retryMessage(item);
                          }}
                          disabled={isSending}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Try sending this question again"
                          accessibilityState={{ disabled: isSending }}
                        >
                          <MaterialIcons name="refresh" size={15} color={colors.accentText} />
                          <Text style={styles.needHelpText}>Try again</Text>
                        </PressableScale>
                      </View>
                    ) : null}
                    {item.role === "assistant" && item.logId && item.canRate ? (
                      <View style={styles.feedbackRow}>
                        <PressableScale
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
                        </PressableScale>
                        <PressableScale
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
                        </PressableScale>
                        <PressableScale
                          style={[styles.feedbackButton, copiedMessage === item && styles.feedbackButtonActive]}
                          onPress={() => copyAnswer(item)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={copiedMessage === item ? "Answer copied" : "Copy this answer"}
                        >
                          <MaterialIcons
                            name={copiedMessage === item ? "check" : "content-copy"}
                            size={14}
                            color={copiedMessage === item ? colors.accentText : colors.textMuted}
                          />
                        </PressableScale>
                        {copiedMessage === item ? (
                          <Text style={styles.feedbackThanksText}>Copied</Text>
                        ) : item.feedback ? (
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
                            <WebHitArea slop={8} />
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
                            <MaterialIcons name="confirmation-number" size={16} color={colors.goldInk} />
                          </View>
                          <View style={styles.ticketCardHeaderText}>
                            <Text style={styles.ticketRowLabel} numberOfLines={2}>
                              {item.ticketTitle ?? "General Inquiry"}
                            </Text>
                            <Text style={styles.ticketCode}>{item.ticketCode ?? `Ticket #${item.ticketId}`}</Text>
                          </View>
                        </View>
                        {item.canRate ? (
                          <Text style={styles.ticketRowHint}>Sent to OSA staff - they&apos;ll reply in your Tickets.</Text>
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
                    {/* Only on the replies to the latest question - older suggestions are stale once the student moves on. */}
                    {item.suggestions && index >= replyBatchStart && !isSending ? (
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
                  <Animated.View entering={FadeIn.duration(MOTION.base)} style={styles.assistantRow}>
                    <BotAvatar size={28} />
                    <View>
                      <View style={[styles.messageBubble, styles.messageBubbleAssistant, styles.typingBubble]}>
                        <TypingDots color={colors.accentText} />
                      </View>
                      {waitingHint ? (
                        <Animated.Text entering={FadeIn.duration(MOTION.base)} style={styles.waitingHint} accessibilityLiveRegion="polite">
                          {waitingHint}
                        </Animated.Text>
                      ) : null}
                    </View>
                  </Animated.View>
                ) : null}
              </ScrollView>
            )}

            {messages.length === 0 && !hideSuggestions ? (
              <View
                style={styles.suggestions}
                onLayout={(e) => setSuggestionsHeight(e.nativeEvent.layout.height)}
              >
                {suggestedQuestions.map((question, index) => (
                  <Animated.View
                    key={question}
                    entering={isOfficeSwitch ? FadeIn.duration(MOTION.fast) : FadeInDown.delay(120 + index * 70).duration(MOTION.slow)}
                  >
                    <Pressable
                      style={({ pressed }) => [styles.suggestionCard, pressed && styles.suggestionCardPressed]}
                      onPress={() => {
                        // Sends straight away (it used to only fill the box).
                        // Anything already typed in the box stays there.
                        if (isSending) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        sendMessage(question);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Ask: ${question}`}
                    >
                      <Text style={styles.suggestionText} numberOfLines={2}>
                        {question}
                      </Text>
                      <MaterialIcons name="north-east" size={14} color={colors.white} style={styles.suggestionChevron} />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            ) : null}

            {/* The welcome screen suggests only the most-asked FAQs. A phase's
                own suggested questions aren't shown here: they often have no
                FAQ answer, so tapping one would just open a ticket. */}
            <View style={styles.composer} onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}>
              <TextInput
                ref={inputRef}
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
                ref={keepTypingFocus}
                style={({ pressed }) => [
                  styles.sendButton,
                  !canSend && !isSending && styles.sendButtonDisabled,
                  pressed && styles.sendButtonPressed,
                ]}
                onPress={handleSend}
                disabled={!canSend}
                accessibilityRole="button"
                hitSlop={4}
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !canSend }}
              >
                <WebHitArea slop={4} />
                {isSending ? (
                  <ActivityIndicator size="small" color={brandColors.navy} />
                ) : (
                  <MaterialIcons name="arrow-upward" size={20} color={canSend ? brandColors.navy : colors.textMuted} />
                )}
              </Pressable>
            </View>
            {!isKeyboardOpen ? (
              <Text
                style={styles.disclaimer}
                onLayout={(e) => setDisclaimerSpace(e.nativeEvent.layout.height + DISCLAIMER_MARGIN)}
              >
                ChatDesk can make mistakes. Check important info with OSA.
              </Text>
            ) : null}
          </View>

          <NavMenu
            visible={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            userInitial={userInitial}
            onLogout={logout}
          />
        </Pressable>
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
    categoryModalFill: { flex: 1 },
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
    // overflow hidden: if the greeting still can't fit, it is clipped rather
    // than drawn over the office picker or the suggestion cards.
    welcomeBlock: { flex: 1, minHeight: 0, overflow: "hidden", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
    welcomeContent: { alignItems: "center" },
    welcomeGreeting: {
      marginTop: 16,
      fontFamily: "Montserrat_700Bold",
      fontSize: 15,
      color: colors.textSecondary,
    },
    welcomeGreetingTight: { marginTop: 0 },
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
    answerQuestion: {
      color: colors.accentText,
      fontFamily: "Montserrat_700Bold",
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 4,
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
    retryPill: {
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
    suggestions: { paddingBottom: 10, gap: 6 },
    suggestionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      // Lighter than before (was 13/14 padding, 14pt text, a sparkle icon).
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 14,
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
      fontSize: 13,
      lineHeight: 18,
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
    // Empty input: a quiet outline instead of a faded gold circle that
    // looks broken.
    sendButtonDisabled: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.border },
    waitingHint: {
      marginTop: 4,
      marginLeft: 4,
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      color: colors.textSecondary,
    },
    sendButtonPressed: { transform: [{ scale: 0.94 }] },
    disclaimer: {
      textAlign: "center",
      fontFamily: "Montserrat_400Regular",
      fontSize: 11,
      color: "rgba(255,255,255,0.6)",
      marginBottom: DISCLAIMER_MARGIN,
    },
  });

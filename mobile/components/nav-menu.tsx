import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandTitle } from "./brand-title";
import { PressableScale } from "./pressable-scale";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useTheme } from "../context/ThemeContext";
import { colors as brandColors, type ThemePalette } from "../theme/colors";

// Tickets and Announcements moved to the bottom tab bar - listing them here
// too would just be a second path to the same screen. This menu now holds
// only what doesn't have a permanent tab slot.
// "More" used to hide the one survey link behind a toggle - with a single
// item it's simpler to show it.
const MENU_ITEMS: { label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { label: "Start Chat", icon: "chat-bubble-outline" },
  { label: "Settings", icon: "settings" },
  { label: "SUS Survey", icon: "poll" },
];

const PANEL_WIDTH_RATIO = 0.62;
const ANIMATION_DURATION = 260;
const SUS_SURVEY_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeygl0FHqVdkRuuLLCEImGS5ExyRKjZnNO7XngacoOj5pNkGA/viewform?usp=publish-editor";

type NavMenuProps = {
  visible: boolean;
  onClose: () => void;
  userInitial: string;
  onLogout: () => Promise<void>;
};

export function NavMenu({ visible, onClose, userInitial, onLogout }: NavMenuProps) {
  const { colors, isDark, toggleDarkMode } = useTheme();
  const { currentUser } = useAuth();
  const styles = createStyles(colors);
  const { history, activeSessionId, resumeSession, startNewChat, deleteSession } = useChat();
  // The History chat asking "Delete ...?" (one at a time).
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const panelWidth = width * PANEL_WIDTH_RATIO;
  const [isMounted, setIsMounted] = useState(visible);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const translateX = useSharedValue(-panelWidth);

  // Mount as soon as the menu is asked to open (during render, not in the
  // effect below); it unmounts after the closing slide finishes.
  if (visible && !isMounted) setIsMounted(true);

  useEffect(() => {
    if (visible) {
      translateX.value = withTiming(0, {
        duration: ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateX.value = withTiming(
        -panelWidth,
        { duration: ANIMATION_DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setIsMounted)(false);
        }
      );
    }
  }, [visible, panelWidth, translateX]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleOpenSusSurvey = () => {
    onClose();
    Linking.openURL(SUS_SURVEY_URL).catch(() => {
      Alert.alert("Unable to open link", "Please check your internet connection and try again.");
    });
  };

  const handleMenuItemPress = (label: string) => {
    if (label === "Start Chat") {
      startNewChat();
      onClose();
      router.push("/");
      return;
    }
    if (label === "Settings") {
      onClose();
      router.push("/settings");
      return;
    }
    if (label === "SUS Survey") {
      handleOpenSusSurvey();
      return;
    }
    Alert.alert(label, "Coming soon.");
  };

  const handleResumeSession = (sessionId: string) => {
    resumeSession(sessionId);
    onClose();
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!isMounted) return null;

  return (
    <Modal transparent visible={isMounted} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>

      <Animated.View style={[styles.panel, { width: panelWidth }, panelStyle]}>
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <PressableScale
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <MaterialIcons name="close" size={24} color={colors.accentText} />
            </PressableScale>
            <BrandTitle style={styles.title} chatColor={isDark ? brandColors.white : brandColors.navy} />
            <PressableScale
              style={styles.avatar}
              hitSlop={12}
              onPress={() => {
                onClose();
                router.push("/profile");
              }}
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

          <View style={styles.menuList}>
            {MENU_ITEMS.map((item) => (
              <PressableScale pressedScale={0.98}
                key={item.label}
                style={styles.menuRow}
                onPress={() => handleMenuItemPress(item.label)}
                hitSlop={{ top: 2, bottom: 2 }}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <MaterialIcons name={item.icon} size={20} color={colors.accentText} />
                <Text style={styles.menuLabel}>{item.label}</Text>
              </PressableScale>
            ))}
          </View>

          <Text style={styles.historyHeading}>History</Text>
          {history.length === 0 ? (
            <View style={styles.historyList}>
              <Text style={styles.historyEmpty}>No recent chats yet.</Text>
            </View>
          ) : (
            <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>
              {history.map((session) => {
                // The chat on screen stays in the list, highlighted (like ChatGPT).
                const isOpen = session.id === activeSessionId;
                if (confirmingDelete === session.id) {
                  return (
                    <View key={session.id} style={[styles.historyRow, styles.historyConfirm]} accessibilityRole="alert">
                      <Text style={styles.historyConfirmText} numberOfLines={2}>
                        Delete “{session.title}”?
                      </Text>
                      <View style={styles.historyConfirmButtons}>
                        <PressableScale
                          onPress={() => {
                            setConfirmingDelete(null);
                            deleteSession(session.id);
                          }}
                          hitSlop={8}
                          style={styles.historyConfirmButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete chat: ${session.title}`}
                        >
                          <Text style={[styles.historyConfirmAction, { color: colors.errorRed }]}>Delete</Text>
                        </PressableScale>
                        <PressableScale
                          onPress={() => setConfirmingDelete(null)}
                          hitSlop={8}
                          style={styles.historyConfirmButton}
                          accessibilityRole="button"
                          accessibilityLabel="Keep this chat"
                        >
                          <Text style={styles.historyConfirmAction}>Cancel</Text>
                        </PressableScale>
                      </View>
                    </View>
                  );
                }
                return (
                  <View key={session.id} style={[styles.historyItem, isOpen && styles.historyRowOpen]}>
                    <PressableScale pressedScale={0.98}
                      style={styles.historyRowMain}
                      onPress={() => handleResumeSession(session.id)}
                      accessibilityRole="button"
                      accessibilityLabel={session.title}
                      accessibilityState={{ selected: isOpen }}
                    >
                      <Text style={[styles.historyLabel, isOpen && styles.historyLabelOpen]} numberOfLines={1}>
                        {session.title}
                      </Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => setConfirmingDelete(session.id)}
                      hitSlop={6}
                      style={styles.historyDelete}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${session.title}`}
                    >
                      <MaterialIcons name="delete-outline" size={18} color={colors.textMuted} />
                    </PressableScale>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Pinned to the bottom, away from History, so it never moves. */}
          <View style={styles.footer}>
            {/* Dark Mode lives here (moved from Settings) so it's one tap
                away. The whole row toggles it, not just the switch. */}
            <Pressable
              style={styles.footerRow}
              onPress={toggleDarkMode}
              accessibilityRole="switch"
              accessibilityLabel="Dark Mode"
              accessibilityState={{ checked: isDark }}
              aria-checked={isDark}
            >
              <MaterialIcons name="dark-mode" size={20} color={colors.accentText} />
              <Text style={styles.menuLabel}>Dark Mode</Text>
              {/* Shows the state only - taps go to the row, so a tap on the
                  switch itself can't toggle twice. Hidden from screen
                  readers, which already hear the row as a switch. */}
              <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
                <Switch
                  value={isDark}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={colors.white}
                  // Web: react-native-web colours the "on" knob from its own
                  // prop (default green) instead of thumbColor.
                  {...({ activeThumbColor: colors.white } as object)}
                />
              </View>
            </Pressable>
            <PressableScale
              style={styles.logoutButton}
              pressedScale={0.98}
              onPress={handleLogout}
              disabled={isLoggingOut}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <MaterialIcons name="logout" size={20} color={colors.errorRed} />
              <Text style={styles.logoutText}>{isLoggingOut ? "Logging out..." : "Log Out"}</Text>
            </PressableScale>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    panel: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 4, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 12,
    },
    screen: { flex: 1, paddingHorizontal: 16 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 16,
    },
    title: { fontSize: 17 },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.accentText,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: { width: 26, height: 26 },
    avatarText: { fontFamily: "Montserrat_700Bold", color: colors.accentText, fontSize: 11 },
    menuList: { marginTop: 4 },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 10,
    },
    menuLabel: { flex: 1, fontFamily: "Montserrat_400Regular", fontSize: 15, color: colors.textPrimary },
    historyHeading: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 14,
      color: colors.accentText,
      marginTop: 18,
      marginBottom: 6,
    },
    historyList: { flex: 1 },
    historyListContent: { paddingBottom: 12 },
    historyRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, marginBottom: 2 },
    // A History chat: the title (opens it) and a delete button.
    historyItem: { flexDirection: "row", alignItems: "center", borderRadius: 10, marginBottom: 2 },
    historyRowMain: { flex: 1, minWidth: 0, paddingVertical: 12, paddingLeft: 10, paddingRight: 4 },
    historyDelete: { paddingVertical: 10, paddingHorizontal: 10 },
    historyConfirm: { gap: 8, backgroundColor: `${colors.errorRed}14` },
    historyConfirmText: { fontFamily: "Montserrat_700Bold", fontSize: 13, lineHeight: 18, color: colors.textPrimary },
    historyConfirmButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 4 },
    historyConfirmButton: { paddingVertical: 4, paddingHorizontal: 10 },
    historyConfirmAction: { fontFamily: "Montserrat_700Bold", fontSize: 13, color: colors.textSecondary },
    historyRowOpen: { backgroundColor: `${colors.accentText}1F` },
    historyLabel: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: colors.textPrimary },
    historyLabelOpen: { fontFamily: "Montserrat_700Bold", color: colors.accentText },
    historyEmpty: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
    },
    footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8 },
    footerRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
    logoutButton: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
    logoutText: { fontFamily: "Montserrat_700Bold", color: colors.errorRed, fontSize: 15 },
  });

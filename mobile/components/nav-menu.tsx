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
const MENU_ITEMS: { label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { label: "Start Chat", icon: "chat-bubble-outline" },
  { label: "Settings", icon: "settings" },
  { label: "More", icon: "more-horiz" },
];

const PANEL_WIDTH_RATIO = 0.62;
const ANIMATION_DURATION = 260;
const SUS_ROW_HEIGHT = 42;
const SUS_SURVEY_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeygl0FHqVdkRuuLLCEImGS5ExyRKjZnNO7XngacoOj5pNkGA/viewform?usp=publish-editor";

type NavMenuProps = {
  visible: boolean;
  onClose: () => void;
  userInitial: string;
  onLogout: () => Promise<void>;
};

export function NavMenu({ visible, onClose, userInitial, onLogout }: NavMenuProps) {
  const { colors, isDark } = useTheme();
  const { currentUser } = useAuth();
  const styles = createStyles(colors);
  const { history, resumeSession, startNewChat } = useChat();
  const { width } = useWindowDimensions();
  const panelWidth = width * PANEL_WIDTH_RATIO;
  const [isMounted, setIsMounted] = useState(visible);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const translateX = useSharedValue(-panelWidth);
  const moreProgress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
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

  const susRowStyle = useAnimatedStyle(() => ({
    height: moreProgress.value * SUS_ROW_HEIGHT,
    opacity: moreProgress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${moreProgress.value * 180}deg` }],
  }));

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
    if (label === "More") {
      setIsMoreExpanded((prev) => {
        const next = !prev;
        moreProgress.value = withTiming(next ? 1 : 0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
        return next;
      });
      return;
    }
    Alert.alert(label, "Coming soon.");
  };

  const handleOpenSusSurvey = () => {
    onClose();
    Linking.openURL(SUS_SURVEY_URL).catch(() => {
      Alert.alert("Unable to open link", "Please check your internet connection and try again.");
    });
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
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={item.label === "More" ? { expanded: isMoreExpanded } : undefined}
              >
                <MaterialIcons name={item.icon} size={20} color={colors.accentText} />
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.label === "More" ? (
                  <Animated.View style={chevronStyle}>
                    <MaterialIcons name="expand-more" size={20} color={colors.accentText} />
                  </Animated.View>
                ) : null}
              </PressableScale>
            ))}
            <Animated.View style={[styles.subMenuContainer, susRowStyle]}>
              <Pressable
                style={({ pressed }) => [styles.subMenuRow, pressed && styles.subMenuRowPressed]}
                onPress={handleOpenSusSurvey}
              >
                <MaterialIcons name="poll" size={18} color={colors.accentText} />
                <Text style={styles.subMenuLabel}>SUS Survey</Text>
              </Pressable>
            </Animated.View>
          </View>

          <Text style={styles.historyHeading}>History</Text>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>No recent chats yet.</Text>
          ) : (
            <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>
              {history.map((session) => (
                <PressableScale pressedScale={0.98}
                  key={session.id}
                  style={styles.historyRow}
                  onPress={() => handleResumeSession(session.id)}
                >
                  <Text style={styles.historyLabel} numberOfLines={1}>
                    {session.title}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <PressableScale style={styles.logoutButton} onPress={handleLogout} disabled={isLoggingOut}>
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
    subMenuContainer: {
      overflow: "hidden",
      justifyContent: "center",
    },
    subMenuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingLeft: 32,
    },
    subMenuRowPressed: { opacity: 0.6 },
    subMenuLabel: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: colors.textSecondary },
    historyHeading: {
      fontFamily: "Montserrat_700Bold",
      fontSize: 14,
      color: colors.accentText,
      marginTop: 18,
      marginBottom: 6,
    },
    historyList: { flex: 1 },
    historyListContent: { paddingBottom: 12 },
    historyRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    historyLabel: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: colors.textPrimary },
    historyEmpty: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
    },
    footer: { alignItems: "flex-end", paddingVertical: 14 },
    logoutButton: {
      borderWidth: 1,
      borderColor: colors.accentText,
      borderRadius: 8,
      paddingVertical: 9,
      paddingHorizontal: 18,
    },
    logoutText: { fontFamily: "Montserrat_700Bold", color: colors.accentText, fontSize: 13 },
  });

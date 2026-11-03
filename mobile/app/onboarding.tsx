import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PressableScale } from "../components/pressable-scale";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { ThemePalette } from "../theme/colors";

const SLIDES: { icon: keyof typeof MaterialIcons.glyphMap; title: string; body: string }[] = [
  {
    icon: "chat-bubble-outline",
    title: "Ask anything, anytime",
    body: "ChatDesk answers common student questions instantly - no more waiting in line for routine procedures.",
  },
  {
    icon: "confirmation-number",
    title: "Can't be answered instantly?",
    body: "We'll automatically create a support ticket and route it to staff - check the Tickets tab for the answer once it's ready.",
  },
  {
    icon: "apartment",
    title: "Pick a category to route faster",
    body: "Before asking, tap the category chip and choose the office your question is about - it helps get your ticket to the right people sooner.",
  },
];

export function onboardingStorageKey(userId: number) {
  return `chatdesk_onboarding_seen_${userId}`;
}

export default function OnboardingScreen() {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [step, setStep] = useState(0);
  const isLastSlide = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  const finish = async () => {
    if (currentUser) {
      try {
        await AsyncStorage.setItem(onboardingStorageKey(currentUser.user_id), "true");
      } catch {
        // Storage unavailable - onboarding will just show again next login,
        // not worth blocking navigation over.
      }
    }
    router.replace("/");
  };

  const handleNext = () => {
    Haptics.selectionAsync().catch(() => {});
    if (isLastSlide) {
      finish();
    } else {
      setStep((prev) => prev + 1);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <PressableScale onPress={finish} style={styles.skipButton} accessibilityRole="button" accessibilityLabel="Skip">
        <Text style={styles.skipText}>Skip</Text>
      </PressableScale>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <MaterialIcons name={slide.icon} size={44} color={colors.accentText} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, index) => (
          <View
            key={index}
            style={[styles.dot, index === step ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>

      <PressableScale
        style={styles.nextButton}
        onPress={handleNext}
        accessibilityRole="button"
        accessibilityLabel={isLastSlide ? "Get Started" : "Next"}
      >
        <Text style={styles.nextButtonText}>{isLastSlide ? "Get Started" : "Next"}</Text>
      </PressableScale>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 28 },
    skipButton: { alignSelf: "flex-end", paddingVertical: 12 },
    skipText: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: colors.textSecondary },
    content: { flex: 1, alignItems: "center", justifyContent: "center" },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.accent + "1A",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    title: {
      fontSize: 24,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: 12,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      fontFamily: "Montserrat_400Regular",
      color: colors.textSecondary,
      textAlign: "center",
      maxWidth: 320,
    },
    dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotActive: { backgroundColor: colors.accent, width: 20 },
    dotInactive: { backgroundColor: colors.border },
    nextButton: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center",
      marginBottom: 20,
    },
    nextButtonText: { fontSize: 16, fontFamily: "Montserrat_700Bold", color: colors.white },
  });

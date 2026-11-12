import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { MOTION } from "../lib/motion";
import { useIsOnline } from "../lib/network";

// A small pill at the top of every screen while the connection is down, so a
// failed message isn't a surprise. Kept short so it sits between the header's
// menu and profile buttons; taps go through to the screen below it.
export function OfflineBanner() {
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (isOnline) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 14 }]} pointerEvents="none">
      <Animated.View
        entering={FadeInUp.duration(MOTION.base)}
        exiting={FadeOutUp.duration(MOTION.base)}
        style={[styles.pill, { backgroundColor: colors.textPrimary }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <MaterialIcons name="wifi-off" size={16} color={colors.surface} />
        <Text style={[styles.text, { color: colors.surface }]}>{"You're offline"}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 1000,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  text: { fontFamily: "Montserrat_700Bold", fontSize: 13 },
});

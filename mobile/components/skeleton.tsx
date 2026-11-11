import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";

// A single shimmering placeholder block. Compose several of these into
// content-shaped rows (see SkeletonRow below) instead of a bare spinner -
// it reads as "here's what's coming" rather than "please wait."
export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { backgroundColor: colors.border, borderRadius: 8 },
        style,
        animatedStyle,
      ]}
    />
  );
}

export function SkeletonTicketRow() {
  return (
    <View style={styles.ticketRow}>
      <SkeletonBlock style={{ width: "45%", height: 15 }} />
      <SkeletonBlock style={{ width: 50, height: 15, alignSelf: "center" }} />
      <SkeletonBlock style={{ width: 60, height: 26, borderRadius: 13, alignSelf: "center" }} />
    </View>
  );
}

export function SkeletonAnnouncementCard() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <SkeletonBlock style={{ width: "60%", height: 15, marginBottom: 10 }} />
      <SkeletonBlock style={{ width: "100%", height: 12, marginBottom: 6 }} />
      <SkeletonBlock style={{ width: "90%", height: 12, marginBottom: 10 }} />
      <SkeletonBlock style={{ width: 80, height: 11 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
  },
});

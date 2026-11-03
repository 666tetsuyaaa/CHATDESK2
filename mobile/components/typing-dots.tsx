import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// Three bouncing dots - the familiar "assistant is typing" cue used by
// modern chat apps, instead of a generic spinner.
function Dot({ color, delay }: { color: string; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 300 })
        ),
        -1
      )
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -4 * progress.value }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />;
}

export function TypingDots({ color }: { color: string }) {
  return (
    <View style={styles.row} accessibilityLabel="ChatDesk is typing">
      <Dot color={color} delay={0} />
      <Dot color={color} delay={150} />
      <Dot color={color} delay={300} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5, height: 16 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

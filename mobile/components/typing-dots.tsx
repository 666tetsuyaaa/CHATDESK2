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

function Dot({ delay, color }: { delay: number; color: string }) {
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
    transform: [{ translateY: -3 * progress.value }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />;
}

// "ChatDesk is typing" - three dots bouncing in turn, on the UI thread so it
// stays smooth while the JS thread is busy handling the reply.
export function TypingDots({ color }: { color: string }) {
  return (
    <View style={styles.row} accessibilityLabel="ChatDesk is typing">
      <Dot delay={0} color={color} />
      <Dot delay={150} color={color} />
      <Dot delay={300} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5, height: 16 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});

import { useEffect } from "react";
import { Image } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";

/**
 * The ChatDesk robot on its own (no circle) for the chat welcome screen,
 * hovering gently up and down. Navy strokes in light mode, white in dark
 * mode, gold accents in both. The hover stops for people who turned on
 * Reduce Motion (Reanimated follows that setting).
 */
export function FloatingLogo({ size = 72 }: { size?: number }) {
  const { isDark } = useTheme();
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
  }, [lift]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));

  return (
    <Animated.View style={style} accessibilityRole="image" accessibilityLabel="ChatDesk">
      <Image
        source={isDark ? require("../assets/logo-white.png") : require("../assets/logo-navy.png")}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { WebHitArea } from "./web-hit-area";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  // How far it shrinks while held - wide rows look better with a smaller dip.
  pressedScale?: number;
};

// Drop-in Pressable for buttons, chips, rows and icons: it eases down a little
// while held so every tap gets visible feedback. Scale only (no opacity) so it
// never fights a button's own disabled/dimmed style. Runs on the UI thread.
export function PressableScale({
  style,
  pressedScale = 0.96,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - pressedScale) }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: 160 });
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {(state) => (
        <>
          {/* hitSlop also works in the web app (react-native-web ignores it). */}
          <WebHitArea slop={rest.hitSlop} />
          {typeof children === "function" ? children(state) : children}
        </>
      )}
    </AnimatedPressable>
  );
}

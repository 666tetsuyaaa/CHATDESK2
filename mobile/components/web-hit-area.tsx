import { Platform, View, type Insets } from "react-native";

/**
 * Web only: an invisible area around a small button that also counts as a
 * tap on it, so icon buttons reach the 44-point minimum touch size.
 * (Phones get this from the button's own hitSlop; react-native-web ignores
 * hitSlop.) Put it first inside the button, with the same value as hitSlop.
 */
export function WebHitArea({ slop }: { slop?: Insets | number | null }) {
  if (Platform.OS !== "web" || slop == null) return null;
  const s = typeof slop === "number" ? { top: slop, bottom: slop, left: slop, right: slop } : slop;
  return (
    <View
      aria-hidden
      style={{
        position: "absolute",
        top: -(s.top ?? 0),
        bottom: -(s.bottom ?? 0),
        left: -(s.left ?? 0),
        right: -(s.right ?? 0),
      }}
    />
  );
}

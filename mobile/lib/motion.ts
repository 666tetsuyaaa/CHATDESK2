import { Platform } from "react-native";

// One set of animation timings for the whole app (milliseconds), so lists,
// cards and pop-ups all move at the same pace.
// - fast: things that react to a tap (a list opening, a quick swap)
// - base: content arriving (a new message, a card, a header resize)
// - slow: a screen's first appearance (the welcome screen)
export const MOTION = {
  fast: 150,
  base: 220,
  slow: 320,
} as const;

/**
 * Whether the phone/browser asks for less motion (iPhone: Settings >
 * Accessibility > Motion > Reduce Motion). Reanimated's animations already
 * follow this setting by themselves; this is for the few effects that aren't
 * Reanimated (web CSS transitions, the reply reveal).
 */
export function prefersReducedMotionOnWeb() {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

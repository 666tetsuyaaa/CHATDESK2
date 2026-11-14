import { useSafeAreaInsets } from "react-native-safe-area-context";

// The bottom tab bar's height without the phone's home-indicator area. The
// default (49) only fits a bare icon + label; the 30px pill squeezed the
// labels out of sight.
export const TAB_BAR_HEIGHT = 62;

/**
 * Full height of the bottom tab bar. The bar floats over the tab screens
 * (frosted glass - see (tabs)/_layout.tsx), so each tab screen leaves this
 * much room at the bottom: lists scroll behind the bar and their last item
 * can still scroll fully above it.
 */
export function useTabBarHeight() {
  return TAB_BAR_HEIGHT + useSafeAreaInsets().bottom;
}

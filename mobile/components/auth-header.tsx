import { Image, ImageBackground, Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardOpen } from "../lib/keyboard";
import { MOTION, prefersReducedMotionOnWeb } from "../lib/motion";
import { BrandTitle } from "./brand-title";

const FULL_HEIGHT = 230;
const COMPACT_HEIGHT = 72;

// Web: CSS transitions so the header glides between its two sizes instead of
// jumping. (Phones animate the same change with LayoutAnimation - see
// useKeyboardOpen in lib/keyboard.ts.)
const webTransition = (properties: string): ViewStyle | null =>
  Platform.OS === "web" && !prefersReducedMotionOnWeb()
    ? ({ transitionProperty: properties, transitionDuration: `${MOTION.base}ms`, transitionTimingFunction: "ease-out" } as ViewStyle)
    : null;
const HEIGHT_TRANSITION = webTransition("height");
const FADE_TRANSITION = webTransition("opacity");

// Shared header for login/register/forgot-password - the campus photo
// backdrop with a navy tint, and the mascot logo sitting directly on it
// (no white card behind the logo) so its navy background blends into the
// tinted photo instead of reading as a separate sticker.
//
// While the keyboard is open it shrinks to a slim bar (small logo beside the
// name), so the boxes being filled in fit above the keyboard, and grows back
// when the keyboard closes. Both looks are drawn on top of each other and
// cross-fade while the height changes, so the switch is smooth.
export function AuthHeader() {
  const isKeyboardOpen = useKeyboardOpen();
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground
      source={require("../assets/login.jpg")}
      style={[styles.header, { height: isKeyboardOpen ? COMPACT_HEIGHT + insets.top : FULL_HEIGHT }, HEIGHT_TRANSITION]}
      imageStyle={[styles.headerImage, isKeyboardOpen && styles.roundedCompact]}
      resizeMode="cover"
    >
      <View style={[styles.overlay, isKeyboardOpen && styles.roundedCompact]} />

      {/* Full header: big logo above the name. */}
      <View
        style={[styles.layer, { opacity: isKeyboardOpen ? 0 : 1 }, FADE_TRANSITION]}
        pointerEvents="none"
        aria-hidden={isKeyboardOpen}
      >
        <Image source={require("../assets/1.png")} style={styles.logo} resizeMode="contain" />
        <BrandTitle style={styles.brandTitle} />
      </View>

      {/* Slim bar while typing: small logo beside the name. */}
      <View
        style={[styles.layer, styles.layerCompact, { paddingTop: insets.top, opacity: isKeyboardOpen ? 1 : 0 }, FADE_TRANSITION]}
        pointerEvents="none"
        aria-hidden={!isKeyboardOpen}
      >
        <Image source={require("../assets/1.png")} style={styles.logoCompact} resizeMode="contain" />
        <BrandTitle style={[styles.brandTitle, styles.brandTitleCompact]} />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    overflow: "hidden",
  },
  headerImage: {
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  overlay: {
    // StyleSheet.absoluteFillObject was removed as of RN/SDK 56 - this is
    // its long-standing, stable definition, needed here (not
    // StyleSheet.absoluteFill) because it's spread into a plain style
    // object alongside other properties, not used as a style prop directly.
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(18, 25, 74, 0.6)",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  // Each look fills the header and centers its content.
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  layerCompact: {
    flexDirection: "row",
    gap: 10,
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  logoCompact: {
    width: 40,
    height: 40,
  },
  brandTitle: {
    fontSize: 24,
    textShadowColor: "rgba(0, 0, 0, 0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  brandTitleCompact: {
    fontSize: 20,
  },
  roundedCompact: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
});

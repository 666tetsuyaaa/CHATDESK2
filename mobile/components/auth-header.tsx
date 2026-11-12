import { Image, ImageBackground, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardOpen } from "../lib/keyboard";
import { BrandTitle } from "./brand-title";

// Shared header for login/register/forgot-password - the campus photo
// backdrop with a navy tint, and the mascot logo sitting directly on it
// (no white card behind the logo) so its navy background blends into the
// tinted photo instead of reading as a separate sticker.
//
// While the keyboard is open it shrinks to a slim bar (small logo beside the
// name), so the email and password boxes both fit above the keyboard - or,
// with whileTyping="hidden" (Sign up, the longest form), disappears
// completely. It comes back when the keyboard closes.
export function AuthHeader({ whileTyping = "compact" }: { whileTyping?: "compact" | "hidden" }) {
  const isKeyboardOpen = useKeyboardOpen();
  const insets = useSafeAreaInsets();

  if (isKeyboardOpen && whileTyping === "hidden") {
    // Keep clear of the phone's status bar / notch.
    return <View style={{ height: insets.top }} />;
  }

  return (
    <ImageBackground
      source={require("../assets/login.jpg")}
      style={[styles.header, isKeyboardOpen && [styles.headerCompact, { height: 72 + insets.top, paddingTop: insets.top }]]}
      imageStyle={[styles.headerImage, isKeyboardOpen && styles.headerImageCompact]}
      resizeMode="cover"
    >
      <View style={[styles.overlay, isKeyboardOpen && styles.headerImageCompact]} />
      <Image
        source={require("../assets/1.png")}
        style={[styles.logo, isKeyboardOpen && styles.logoCompact]}
        resizeMode="contain"
      />
      <BrandTitle style={isKeyboardOpen ? [styles.brandTitle, styles.brandTitleCompact] : styles.brandTitle} />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 230,
    alignItems: "center",
    justifyContent: "center",
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
  logo: {
    width: 88,
    height: 88,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  brandTitle: {
    fontSize: 24,
    textShadowColor: "rgba(0, 0, 0, 0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  headerCompact: {
    flexDirection: "row",
    gap: 10,
  },
  headerImageCompact: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  logoCompact: {
    width: 40,
    height: 40,
    marginBottom: 0,
  },
  brandTitleCompact: {
    fontSize: 20,
  },
});

import { Image, ImageBackground, StyleSheet, View } from "react-native";
import { BrandTitle } from "./brand-title";

// Shared header for login/register/forgot-password - the campus photo
// backdrop with a navy tint, and the mascot logo sitting directly on it
// (no white card behind the logo) so its navy background blends into the
// tinted photo instead of reading as a separate sticker.
export function AuthHeader() {
  return (
    <ImageBackground
      source={require("../assets/login.jpg")}
      style={styles.header}
      imageStyle={styles.headerImage}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <Image source={require("../assets/1.png")} style={styles.logo} resizeMode="contain" />
      <BrandTitle style={styles.brandTitle} />
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
});

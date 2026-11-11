import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

// ChatDesk's robot mark on a brand-navy circle - marks assistant messages
// and the chat welcome screen, like the assistant avatar in AI chat apps.
export function BotAvatar({ size = 28 }: { size?: number }) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={require("../assets/1.png")}
        style={{ width: size * 0.78, height: size * 0.78 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.35)",
  },
});

import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

const FLAG = "chatdesk_debug";

function enabled() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    if (window.location.hash.includes("debug")) window.sessionStorage.setItem(FLAG, "1");
    if (window.location.hash.includes("nodebug")) window.sessionStorage.removeItem(FLAG);
    return window.sessionStorage.getItem(FLAG) === "1";
  } catch {
    return window.location.hash.includes("debug");
  }
}

function read() {
  const vv = window.visualViewport;
  const root = document.getElementById("root");
  const rootBox = root?.getBoundingClientRect();
  const active = document.activeElement as HTMLElement | null;
  return [
    `inner ${window.innerWidth}x${window.innerHeight}  page ${document.documentElement.clientHeight}`,
    `visible h ${vv ? Math.round(vv.height) : "-"} top ${vv ? Math.round(vv.offsetTop) : "-"}  scrollY ${Math.round(window.scrollY)}`,
    `root ${root?.style.position || "static"} top ${rootBox ? Math.round(rootBox.top) : "-"} h ${rootBox ? Math.round(rootBox.height) : "-"}`,
    `focus ${active?.tagName ?? "-"}${active?.getAttribute("placeholder") ? ` (${active.getAttribute("placeholder")})` : ""}`,
  ];
}

/**
 * Web only, hidden unless asked for: open the app with #debug at the end of
 * the address to show the live screen measurements the keyboard handling
 * uses (lib/keyboard.ts), so a screenshot from a real phone shows what its
 * browser reports. #nodebug turns it off again. Taps go through it.
 */
export function DebugOverlay() {
  const [isOn] = useState(enabled);
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!isOn) return;
    const refresh = () => setLines(read());
    refresh();
    const timer = setInterval(refresh, 300);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    return () => {
      clearInterval(timer);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, [isOn]);

  if (!isOn) return null;
  return (
    <View style={styles.box} pointerEvents="none">
      {lines.map((line) => (
        <Text key={line} style={styles.text}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    left: 8,
    top: 64,
    zIndex: 2000,
    padding: 6,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  text: { color: "#7CFC9A", fontSize: 10, fontFamily: "monospace" },
});

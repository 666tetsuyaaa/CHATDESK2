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

// Where the visible header is, and every box between it and the app's root
// that is moved: scrolled, padded at the top, transformed, or not at top 0.
function headerChain() {
  // The one actually on screen (the other tabs keep their own, hidden).
  const candidates = [...document.querySelectorAll('[aria-label="Open menu"]')] as HTMLElement[];
  const header =
    candidates.find((e) => {
      const b = e.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return b.width > 0 && !!hit && e.contains(hit);
    }) ?? candidates.find((e) => e.offsetParent !== null);
  if (!header) return ["header -"];
  const root = document.getElementById("root");
  const lines = [`header top ${Math.round(header.getBoundingClientRect().top)}`];
  for (let e: HTMLElement | null = header.parentElement; e && e !== root && lines.length < 7; e = e.parentElement) {
    const cs = getComputedStyle(e);
    const notes = [];
    if (e.scrollTop) notes.push(`scroll ${e.scrollTop}`);
    if (parseFloat(cs.paddingTop) > 4) notes.push(`padTop ${Math.round(parseFloat(cs.paddingTop))}`);
    if (parseFloat(cs.marginTop) !== 0) notes.push(`marTop ${Math.round(parseFloat(cs.marginTop))}`);
    if (cs.transform !== "none") notes.push(`transform ${cs.transform.slice(0, 40)}`);
    if (cs.position === "absolute" || cs.position === "fixed") notes.push(`${cs.position} top ${cs.top} bottom ${cs.bottom}`);
    if (notes.length) lines.push(`  ${e.tagName.toLowerCase()} y${Math.round(e.getBoundingClientRect().top)} h${e.clientHeight}: ${notes.join(", ")}`);
  }
  return lines;
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
    ...headerChain(),
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

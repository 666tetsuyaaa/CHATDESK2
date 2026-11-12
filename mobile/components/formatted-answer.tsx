import { Linking, Platform, StyleSheet, Text, View, type TextStyle } from "react-native";

// Lays out a plain-text FAQ answer so long ones are easy to scan. The text
// itself is never changed - only how it is shown:
// - each line is its own paragraph, blank lines add a gap,
// - "1." / "-" / "•" lines become list items,
// - a short lead-in before " – ", " - " or ":" is bold ("Select Subjects – ...").
type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "item"; marker: string; text: string }
  | { kind: "gap" };

const LIST_ITEM = /^\s*(\d+[.)]|[-•*])\s+(.*)$/;
// Up to ~6 words before the separator, so ordinary sentences with a dash or
// colon later on aren't bolded.
const LEAD_IN = /^([^:–—]{2,48}?)(\s[–—-]\s|:\s)(.+)$/;

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (blocks.length && blocks[blocks.length - 1].kind !== "gap") blocks.push({ kind: "gap" });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const marker = /^\d/.test(item[1]) ? item[1].replace(")", ".") : "•";
      blocks.push({ kind: "item", marker, text: item[2] });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  while (blocks.length && blocks[blocks.length - 1].kind === "gap") blocks.pop();
  return blocks;
}

// Web addresses, emails and Philippine phone numbers in an answer become
// tappable: links open in the browser, emails in the mail app, numbers in
// the phone's dialer. (School IDs like 2023304440 don't match - phone
// numbers need a leading 0/+63, or the (088) area-code form.)
const LINKABLE = new RegExp(
  [
    String.raw`(?<url>\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])`,
    String.raw`(?<www>\bwww\.[^\s<>()]+[^\s<>().,;:!?'"])`,
    String.raw`(?<email>\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b)`,
    String.raw`(?<mobile>(?:\+63[\s-]?|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b)`,
    String.raw`(?<landline>\(0\d{2,3}\)\s?\d{3}[\s-]?\d{4}\b|\b0\d{2,3}[\s-]\d{3}[\s-]?\d{4}\b)`,
  ].join("|"),
  "g"
);

function hrefFor(match: RegExpExecArray) {
  const { url, www, email, mobile, landline } = match.groups ?? {};
  if (url) return url;
  if (www) return `https://${www}`;
  if (email) return `mailto:${email}`;
  const digits = (mobile ?? landline ?? "").replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}

function Linked({ text }: { text: string }) {
  const parts: (string | { label: string; href: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(LINKABLE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ label: match[0], href: hrefFor(match) });
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return <>{text}</>;
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <Text
            key={index}
            style={styles.link}
            // Web: a real link (the browser opens web pages in a new tab and
            // hands tel:/mailto: to the phone). Phones: open it ourselves.
            {...(Platform.OS === "web"
              ? ({
                  href: part.href,
                  hrefAttrs: part.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : undefined,
                } as object)
              : { onPress: () => Linking.openURL(part.href).catch(() => {}) })}
            accessibilityRole="link"
            accessibilityHint={part.href.startsWith("tel:") ? "Calls this number" : undefined}
          >
            {part.label}
          </Text>
        )
      )}
    </>
  );
}

function Rich({ text, style }: { text: string; style: TextStyle }) {
  const lead = LEAD_IN.exec(text);
  if (!lead || lead[1].trim().split(/\s+/).length > 6) {
    return (
      <Text style={style}>
        <Linked text={text} />
      </Text>
    );
  }
  return (
    <Text style={style}>
      <Text style={styles.bold}>
        <Linked text={lead[1]} />
      </Text>
      {lead[2]}
      <Linked text={lead[3]} />
    </Text>
  );
}

export function FormattedAnswer({ text, style }: { text: string; style: TextStyle }) {
  const blocks = parse(text);
  // Short single-line replies render exactly as before (plus tappable links).
  if (blocks.length <= 1 && blocks[0]?.kind !== "item") {
    return (
      <Text style={style}>
        <Linked text={text} />
      </Text>
    );
  }
  return (
    <View style={styles.column}>
      {blocks.map((block, index) => {
        if (block.kind === "gap") return <View key={index} style={styles.gap} />;
        if (block.kind === "item") {
          return (
            <View key={index} style={styles.itemRow}>
              <Text style={[style, styles.marker]}>{block.marker}</Text>
              <View style={styles.itemText}>
                <Rich text={block.text} style={style} />
              </View>
            </View>
          );
        }
        return <Rich key={index} text={block.text} style={style} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 4 },
  gap: { height: 6 },
  itemRow: { flexDirection: "row", gap: 6 },
  marker: { minWidth: 16 },
  itemText: { flex: 1 },
  bold: { fontFamily: "Montserrat_700Bold" },
  // Same colour as the text around it, underlined - readable on both the
  // light and dark bubbles.
  link: { textDecorationLine: "underline" },
});

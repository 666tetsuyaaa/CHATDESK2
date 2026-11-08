import { StyleSheet, Text, View, type TextStyle } from "react-native";

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

function Rich({ text, style }: { text: string; style: TextStyle }) {
  const lead = LEAD_IN.exec(text);
  if (!lead || lead[1].trim().split(/\s+/).length > 6) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      <Text style={styles.bold}>{lead[1]}</Text>
      {lead[2]}
      {lead[3]}
    </Text>
  );
}

export function FormattedAnswer({ text, style }: { text: string; style: TextStyle }) {
  const blocks = parse(text);
  // Short single-line replies render exactly as before.
  if (blocks.length <= 1 && blocks[0]?.kind !== "item") return <Text style={style}>{text}</Text>;
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
});

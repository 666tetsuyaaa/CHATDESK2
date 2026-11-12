import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemePalette } from "../theme/colors";

const STEPS: { status: string; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { status: "pending", label: "Submitted", icon: "send" },
  { status: "active", label: "In progress", icon: "autorenew" },
  { status: "resolved", label: "Resolved", icon: "check" },
];

/**
 * Where a ticket with OSA staff is, at a glance: Submitted -> In progress ->
 * Resolved, with the steps reached so far filled in. (A reopened ticket is
 * back to "Submitted" - it's waiting for staff again.)
 */
export function TicketProgress({ status }: { status: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const current = Math.max(0, STEPS.findIndex((step) => step.status === status));

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Ticket progress: step ${current + 1} of ${STEPS.length}, ${STEPS[current].label}`}
    >
      {/* The connecting line, drawn once behind all the dots: from the first
          step's centre to the last one's, filled up to where the ticket is. */}
      <View style={styles.track} pointerEvents="none">
        {STEPS.slice(1).map((step, index) => (
          <View key={step.status} style={[styles.segment, index + 1 <= current && styles.segmentReached]} />
        ))}
      </View>
      {STEPS.map((step, index) => {
        const reached = index <= current;
        const isCurrent = index === current;
        return (
          <View key={step.status} style={styles.step}>
            <View style={[styles.dot, reached && styles.dotReached, isCurrent && styles.dotCurrent]}>
              <MaterialIcons name={step.icon} size={13} color={reached ? colors.surface : colors.textMuted} />
            </View>
            <Text style={[styles.label, reached && styles.labelReached, isCurrent && styles.labelCurrent]} numberOfLines={1}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 26;

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    row: { flexDirection: "row", marginTop: 4, marginBottom: 14 },
    step: { flex: 1, alignItems: "center" },
    // Each step is a third of the row, so the centres are at 1/6, 3/6, 5/6.
    track: {
      position: "absolute",
      top: DOT / 2 - 1,
      left: "16.667%",
      right: "16.667%",
      height: 2,
      flexDirection: "row",
    },
    segment: { flex: 1, backgroundColor: colors.border },
    segmentReached: { backgroundColor: colors.accentText },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
    },
    dotReached: { backgroundColor: colors.accentText, borderColor: colors.accentText },
    // A soft ring marks where the ticket is now.
    dotCurrent: {
      shadowColor: colors.accentText,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 6,
      elevation: 3,
    },
    label: {
      marginTop: 6,
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    labelReached: { color: colors.textSecondary },
    labelCurrent: { fontFamily: "Montserrat_700Bold", color: colors.accentText },
  });

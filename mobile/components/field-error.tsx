import { Text } from "react-native";
import { useTheme } from "../context/ThemeContext";

// Inline message under a form field.
export function FieldError({ message }: { message?: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <Text
      accessibilityRole="alert"
      style={{ color: colors.errorRed, fontFamily: "Montserrat_400Regular", fontSize: 12, marginTop: 4 }}
    >
      {message}
    </Text>
  );
}

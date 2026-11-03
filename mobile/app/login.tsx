import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { AuthHeader } from "../components/auth-header";
import { FieldError } from "../components/field-error";
import { PressableScale } from "../components/pressable-scale";
import { useAuth } from "../context/AuthContext";
import { type FieldErrors, hasErrors, serverFieldErrors, validateEmail } from "../lib/validation";
import { useTheme } from "../context/ThemeContext";
import type { ThemePalette } from "../theme/colors";

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const { login, sessionExpired } = useAuth();
  const [errorMessage, setErrorMessage] = useState(
    sessionExpired ? "Your session expired. Please log in again." : ""
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const invalid = (field: string) => (fieldErrors[field] ? { borderColor: colors.errorRed } : null);

  const handleLogin = async () => {
    setErrorMessage("");
    const found: FieldErrors = {
      email: validateEmail(email),
      password: password ? null : "Password is required.",
    };
    setFieldErrors(found);
    if (hasErrors(found)) return;

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (error: any) {
      // Login errors (wrong password, unverified email) arrive under
      // details.non_field_errors; rate limits come as the message.
      const { general } = serverFieldErrors(error, "Unable to log in right now.");
      setErrorMessage(general ?? "Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthHeader />

      <ScrollView
        contentContainerStyle={styles.sheet}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Log in</Text>
        <Text style={styles.subheading}>Sign in to continue to ChatDesk</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, invalid("email")]}
          placeholder="you@ustp.edu.ph"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <FieldError message={fieldErrors.email} />

        <Text style={styles.label}>Password</Text>
        <View style={[styles.passwordField, invalid("password")]}>
          <TextInput
            style={styles.passwordInput}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!isPasswordVisible}
            value={password}
            onChangeText={setPassword}
          />
          <PressableScale
            onPress={() => setIsPasswordVisible((prev) => !prev)}
            hitSlop={10}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
          >
            <MaterialIcons
              name={isPasswordVisible ? "visibility-off" : "visibility"}
              size={20}
              color={colors.textMuted}
            />
          </PressableScale>
        </View>
        <FieldError message={fieldErrors.password} />

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <PressableScale pressedScale={0.98}
          onPress={() => router.push("/forgot-password")}
          style={styles.forgotRow}
          accessibilityRole="button"
          accessibilityLabel="Forgot password"
        >
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </PressableScale>

        <PressableScale
          style={styles.button}
          onPress={handleLogin}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Log in"
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Log in</Text>
          )}
        </PressableScale>

        <PressableScale
          onPress={() => router.push("/register")}
          accessibilityRole="button"
          accessibilityLabel="No account? Sign up here"
        >
          <Text style={styles.signupText}>
            No account? <Text style={styles.signupLink}>Sign up here</Text>
          </Text>
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    sheet: {
      flexGrow: 1,
      paddingHorizontal: 28,
      paddingTop: 28,
      paddingBottom: 32,
    },
    heading: {
      fontSize: 24,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    subheading: {
      fontSize: 14,
      fontFamily: "Montserrat_400Regular",
      color: colors.textSecondary,
      marginBottom: 24,
    },
    label: {
      fontSize: 13,
      fontFamily: "Montserrat_400Regular",
      color: colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 13,
      marginBottom: 16,
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    passwordField: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      marginBottom: 4,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    eyeButton: { paddingLeft: 8, paddingVertical: 8 },
    forgotRow: { alignSelf: "flex-end", marginTop: 8, marginBottom: 20 },
    forgotPasswordText: {
      fontSize: 13,
      fontFamily: "Montserrat_700Bold",
      color: colors.gold,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center",
      marginBottom: 20,
    },
    buttonText: { fontSize: 16, fontFamily: "Montserrat_700Bold", color: colors.white },
    signupText: {
      textAlign: "center",
      fontSize: 13,
      fontFamily: "Montserrat_400Regular",
      color: colors.textSecondary,
    },
    signupLink: { fontFamily: "Montserrat_700Bold", color: colors.accentText },
    errorText: {
      color: colors.errorRed,
      fontSize: 13,
      marginBottom: 4,
      textAlign: "center",
    },
  });

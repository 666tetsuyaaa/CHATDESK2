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
import axiosClient from "../lib/axiosClient";
import {
  type FieldErrors,
  hasErrors,
  serverFieldErrors,
  validateEmail,
  validateNewPassword,
  validateResetCode,
} from "../lib/validation";
import { useTheme } from "../context/ThemeContext";
import { KEYBOARD_DISMISS_MODE, useWebKeyboardInset } from "../lib/keyboard";
import type { ThemePalette } from "../theme/colors";

// No mockup for this screen in ui-prototype/ - matches Login/Register's
// structure and USTP branding. Two steps: request a code by email, then
// enter that code with a new password.
export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  // Web: the iPhone keyboard covers the bottom of the page; shrink the
  // form's visible area by that much so the field being typed in scrolls above it.
  const keyboardInset = useWebKeyboardInset();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const invalid = (field: string) => (fieldErrors[field] ? { borderColor: colors.errorRed } : null);

  const handleRequestCode = async () => {
    setErrorMessage("");
    const found: FieldErrors = { email: validateEmail(email) };
    setFieldErrors(found);
    if (hasErrors(found)) return;
    setIsSubmitting(true);
    try {
      const { data } = await axiosClient.post("/auth/password-reset/request/", { email: email.trim() });
      // dev_code only appears while the backend's Gmail App Password isn't
      // configured yet (see backend/.env) - it's the code shown directly
      // here instead of being emailed. Remove this once real email is on.
      if (data.dev_code) {
        setInfoMessage(`Dev mode: email isn't configured yet. Your code is ${data.dev_code}.`);
        setCode(data.dev_code);
      } else {
        setInfoMessage(data.message || "If that email is registered, a code has been sent.");
      }
      setStep("confirm");
    } catch (error: any) {
      const { general } = serverFieldErrors(error, "Unable to send a reset code right now.");
      setErrorMessage(general ?? "Unable to send a reset code right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReset = async () => {
    setErrorMessage("");
    const found: FieldErrors = {
      code: validateResetCode(code),
      new_password: validateNewPassword(newPassword),
      confirm_password: newPassword === confirmPassword ? null : "Passwords do not match.",
    };
    setFieldErrors(found);
    if (hasErrors(found)) return;
    setIsSubmitting(true);
    try {
      await axiosClient.post("/auth/password-reset/confirm/", {
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });
      router.replace("/login");
    } catch (error: any) {
      // e.g. "This password is too common." under new_password, or
      // "Invalid or expired code." under code.
      const { fields, general } = serverFieldErrors(error, "Unable to reset password right now.");
      setFieldErrors(fields);
      setErrorMessage(general ?? "");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, keyboardInset ? { paddingBottom: keyboardInset } : null]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthHeader />

      <ScrollView
        contentContainerStyle={styles.sheet}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={KEYBOARD_DISMISS_MODE}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>{step === "request" ? "Reset password" : "Enter code"}</Text>
        <Text style={styles.subheading}>
          {step === "request" ? "We'll send a code to your email" : "Enter the code we sent you"}
        </Text>

        {step === "request" ? (
          <>
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

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <PressableScale
              style={styles.button}
              onPress={handleRequestCode}
              disabled={isSubmitting || !email}
              accessibilityRole="button"
              accessibilityLabel="Send reset code"
              accessibilityState={{ disabled: isSubmitting || !email, busy: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Send reset code</Text>
              )}
            </PressableScale>
          </>
        ) : (
          <>
            {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={[styles.input, invalid("code")]}
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
            />
            <FieldError message={fieldErrors.code} />

            <Text style={styles.label}>New password</Text>
            <View style={[styles.passwordField, invalid("new_password")]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!isNewPasswordVisible}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <PressableScale
                onPress={() => setIsNewPasswordVisible((prev) => !prev)}
                hitSlop={10}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel={isNewPasswordVisible ? "Hide password" : "Show password"}
              >
                <MaterialIcons
                  name={isNewPasswordVisible ? "visibility-off" : "visibility"}
                  size={20}
                  color={colors.textMuted}
                />
              </PressableScale>
            </View>
            <FieldError message={fieldErrors.new_password} />

            <Text style={styles.label}>Confirm new password</Text>
            <View style={[styles.passwordField, invalid("confirm_password")]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!isConfirmPasswordVisible}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <PressableScale
                onPress={() => setIsConfirmPasswordVisible((prev) => !prev)}
                hitSlop={10}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel={isConfirmPasswordVisible ? "Hide password" : "Show password"}
              >
                <MaterialIcons
                  name={isConfirmPasswordVisible ? "visibility-off" : "visibility"}
                  size={20}
                  color={colors.textMuted}
                />
              </PressableScale>
            </View>
            <FieldError message={fieldErrors.confirm_password} />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <PressableScale
              style={styles.button}
              onPress={handleConfirmReset}
              disabled={isSubmitting || !code || !newPassword || !confirmPassword}
              accessibilityRole="button"
              accessibilityLabel="Reset password"
              accessibilityState={{
                disabled: isSubmitting || !code || !newPassword || !confirmPassword,
                busy: isSubmitting,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Reset password</Text>
              )}
            </PressableScale>

            <PressableScale
              onPress={() => setStep("request")}
              accessibilityRole="button"
              accessibilityLabel="Didn't get a code? Try again"
            >
              <Text style={styles.signupText}>
                Didn&apos;t get a code? <Text style={styles.signupLink}>Try again</Text>
              </Text>
            </PressableScale>
          </>
        )}

        <PressableScale
          onPress={() => router.replace("/login")}
          accessibilityRole="button"
          accessibilityLabel="Back to log in"
        >
          <Text style={styles.signupText}>
            Back to <Text style={styles.signupLink}>Log in</Text>
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
      marginBottom: 16,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    eyeButton: { paddingLeft: 8, paddingVertical: 8 },
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
      marginTop: 4,
    },
    signupLink: { fontFamily: "Montserrat_700Bold", color: colors.accentText },
    errorText: {
      color: colors.errorRed,
      fontSize: 13,
      marginBottom: 12,
      textAlign: "center",
    },
    infoText: {
      color: colors.textPrimary,
      fontSize: 13,
      marginBottom: 16,
      textAlign: "center",
      fontFamily: "Montserrat_400Regular",
    },
  });

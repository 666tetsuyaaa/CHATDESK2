import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FieldError } from "../components/field-error";
import { PressableScale } from "../components/pressable-scale";
import { useTheme } from "../context/ThemeContext";
import axiosClient from "../lib/axiosClient";
import { KEYBOARD_DISMISS_MODE } from "../lib/keyboard";
import { saveTokens } from "../lib/tokenStorage";
import { type FieldErrors, hasErrors, serverFieldErrors, validateNewPassword } from "../lib/validation";
import type { ThemePalette } from "../theme/colors";

type FieldKey = "current_password" | "new_password" | "confirm_password";

// Change password (from Profile): current password, the new one twice.
// The server signs the account out on other devices and sends fresh tokens
// for this one, so the student stays logged in here.
export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [values, setValues] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const newRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const check = (next: typeof values): FieldErrors => ({
    current_password: next.current_password ? null : "Enter your current password.",
    new_password: validateNewPassword(next.new_password),
    confirm_password:
      next.confirm_password === next.new_password ? null : "The two new passwords don't match.",
  });

  const setValue = (key: FieldKey) => (text: string) => {
    const next = { ...values, [key]: text };
    setValues(next);
    // Errors already showing clear as soon as the value is right.
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: check(next)[key] }));
  };

  const handleSave = async () => {
    setErrorMessage("");
    const found = check(values);
    setFieldErrors(found);
    if (hasErrors(found)) return;
    setIsSaving(true);
    try {
      const { data } = await axiosClient.post("/auth/password-change/", {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      await saveTokens(data.access, data.refresh);
      setIsDone(true);
      setValues({ current_password: "", new_password: "", confirm_password: "" });
    } catch (error: any) {
      const { fields, general } = serverFieldErrors(error, "Couldn't change your password right now. Please try again.");
      setFieldErrors(fields);
      setErrorMessage(general ?? "");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <PressableScale
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.accentText} />
          </PressableScale>
          <Text style={styles.title}>Change password</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
          showsVerticalScrollIndicator={false}
        >
          {isDone ? (
            <View style={styles.doneBox} accessibilityRole="alert">
              <MaterialIcons name="check-circle" size={22} color={colors.statusResolved} />
              <Text style={styles.doneText}>
                Your password has been changed. You stay logged in here; other devices will need to log in again.
              </Text>
            </View>
          ) : null}

          <PasswordField
            label="Current password"
            value={values.current_password}
            onChangeText={setValue("current_password")}
            error={fieldErrors.current_password}
            autoComplete="current-password"
            onNext={() => newRef.current?.focus()}
          />
          <PasswordField
            inputRef={newRef}
            label="New password"
            value={values.new_password}
            onChangeText={setValue("new_password")}
            error={fieldErrors.new_password}
            autoComplete="new-password"
            onNext={() => confirmRef.current?.focus()}
          />
          <Text style={styles.hint}>At least 8 characters, not only numbers, and not easy to guess.</Text>
          <PasswordField
            inputRef={confirmRef}
            label="Confirm new password"
            value={values.confirm_password}
            onChangeText={setValue("confirm_password")}
            error={fieldErrors.confirm_password}
            autoComplete="new-password"
            onDone={handleSave}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <PressableScale
            style={styles.button}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Change password"
            accessibilityState={{ disabled: isSaving, busy: isSaving }}
          >
            {isSaving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Change password</Text>}
          </PressableScale>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordField({
  inputRef,
  label,
  value,
  onChangeText,
  error,
  autoComplete,
  onNext,
  onDone,
}: {
  inputRef?: React.Ref<TextInputInstance>;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  autoComplete: "current-password" | "new-password";
  onNext?: () => void;
  onDone?: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [isVisible, setIsVisible] = useState(false);
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.passwordField, error ? { borderColor: colors.errorRed } : null]}>
        <TextInput
          ref={inputRef}
          style={styles.passwordInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!isVisible}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={autoComplete === "current-password" ? "password" : "newPassword"}
          returnKeyType={onNext ? "next" : "done"}
          submitBehavior={onNext ? "submit" : undefined}
          blurOnSubmit={!onNext}
          onSubmitEditing={onNext ?? onDone}
          accessibilityLabel={label}
        />
        <PressableScale
          onPress={() => setIsVisible((prev) => !prev)}
          hitSlop={10}
          style={styles.eyeButton}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          <MaterialIcons name={isVisible ? "visibility-off" : "visibility"} size={20} color={colors.textMuted} />
        </PressableScale>
      </View>
      <FieldError message={error} />
    </>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 20,
    },
    title: { fontSize: 22, fontFamily: "PlusJakartaSans_700Bold", color: colors.textPrimary },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    label: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    passwordField: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.surface,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    eyeButton: { paddingLeft: 8, paddingVertical: 8 },
    hint: {
      marginTop: -10,
      marginBottom: 16,
      fontFamily: "Montserrat_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    errorText: { color: colors.errorRed, fontSize: 13, marginBottom: 12, textAlign: "center" },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 4,
    },
    buttonText: { fontSize: 16, fontFamily: "Montserrat_700Bold", color: colors.white },
    doneBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 14,
      borderRadius: 14,
      marginBottom: 20,
      backgroundColor: `${colors.statusResolved}1A`,
    },
    doneText: { flex: 1, fontFamily: "Montserrat_400Regular", fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  });

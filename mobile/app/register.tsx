import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import {
  type FieldErrors,
  hasErrors,
  serverFieldErrors,
  validateEmail,
  validateNewPassword,
  validatePersonName,
  validateSchoolId,
} from "../lib/validation";
import { useTheme } from "../context/ThemeContext";
import { KEYBOARD_DISMISS_MODE, useWebKeyboardInset } from "../lib/keyboard";
import { COURSE_OPTIONS } from "../lib/courses";
import type { ThemePalette } from "../theme/colors";

// No Registration mockup existed in ui-prototype/ - matches Login's structure
// and the same USTP branding. The course list (lib/courses.ts) was confirmed
// by Jefferson against the official USTP CDO program list.
export default function RegisterScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  // Web: the iPhone keyboard covers the bottom of the page; shrink the
  // form's visible area by that much so the field being typed in scrolls above it.
  const keyboardInset = useWebKeyboardInset();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [course, setCourse] = useState(COURSE_OPTIONS[0].value);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCoursePickerOpen, setIsCoursePickerOpen] = useState(false);
  const { register } = useAuth();

  const selectedCourseLabel = COURSE_OPTIONS.find((option) => option.value === course)?.label;
  const invalid = (field: string) => (fieldErrors[field] ? { borderColor: colors.errorRed } : null);

  const handleRegister = async () => {
    setErrorMessage("");
    const found: FieldErrors = {
      first_name: validatePersonName(firstName, "First name"),
      last_name: validatePersonName(lastName, "Last name"),
      school_id: validateSchoolId(schoolId),
      email: validateEmail(email),
      password: validateNewPassword(password),
    };
    setFieldErrors(found);
    if (hasErrors(found)) return;

    setIsSubmitting(true);
    try {
      await register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        school_id: schoolId.trim(),
        email: email.trim(),
        password,
        course,
      });
      router.replace("/");
    } catch (error: any) {
      // Server-only rules (common password, email/ID already taken) land
      // under the field they belong to.
      const { fields, general } = serverFieldErrors(error, "Unable to register right now.");
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
        <Text style={styles.heading}>Sign up</Text>
        <Text style={styles.subheading}>Create your student account</Text>

        <Text style={styles.label}>First name</Text>
        <TextInput
          style={[styles.input, invalid("first_name")]}
          placeholder="Juan"
          placeholderTextColor={colors.textMuted}
          value={firstName}
          onChangeText={setFirstName}
          maxLength={150}
        />
        <FieldError message={fieldErrors.first_name} />

        <Text style={styles.label}>Last name</Text>
        <TextInput
          style={[styles.input, invalid("last_name")]}
          placeholder="Dela Cruz"
          placeholderTextColor={colors.textMuted}
          value={lastName}
          onChangeText={setLastName}
          maxLength={150}
        />
        <FieldError message={fieldErrors.last_name} />

        <Text style={styles.label}>School ID</Text>
        <TextInput
          style={[styles.input, invalid("school_id")]}
          placeholder="2026-00001"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          value={schoolId}
          onChangeText={setSchoolId}
          maxLength={20}
        />
        <FieldError message={fieldErrors.school_id} />

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

        <Text style={styles.label}>Course</Text>
        <PressableScale pressedScale={0.98}
          style={styles.pickerWrapper}
          onPress={() => setIsCoursePickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Course: ${selectedCourseLabel}`}
        >
          <Text style={styles.pickerValueText}>{selectedCourseLabel}</Text>
          <MaterialIcons name="expand-more" size={20} color={colors.textMuted} />
        </PressableScale>

        <Modal
          visible={isCoursePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsCoursePickerOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setIsCoursePickerOpen(false)}>
            <View style={styles.modalSheet}>
              <FlatList
                data={COURSE_OPTIONS}
                keyExtractor={(option) => option.value}
                renderItem={({ item }) => (
                  <PressableScale pressedScale={0.98}
                    style={styles.modalOption}
                    onPress={() => {
                      setCourse(item.value);
                      setIsCoursePickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        item.value === course && styles.modalOptionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </PressableScale>
                )}
              />
            </View>
          </Pressable>
        </Modal>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <PressableScale
          style={styles.button}
          onPress={handleRegister}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Sign up"
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </PressableScale>

        <PressableScale
          onPress={() => router.push("/login")}
          accessibilityRole="button"
          accessibilityLabel="Already have an account? Log in here"
        >
          <Text style={styles.signupText}>
            Already have an account? <Text style={styles.signupLink}>Log in here</Text>
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
    pickerWrapper: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 13,
      marginBottom: 20,
    },
    pickerValueText: {
      // Long course names (program + major) wrap instead of pushing the arrow off.
      flexShrink: 1,
      marginRight: 8,
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalSheet: {
      maxHeight: 360,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 8,
    },
    modalOption: {
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    modalOptionText: {
      fontSize: 16,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    modalOptionTextSelected: {
      fontFamily: "Montserrat_700Bold",
      color: colors.accentText,
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
      marginBottom: 12,
      textAlign: "center",
    },
  });

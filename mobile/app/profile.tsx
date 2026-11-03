import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FieldError } from "../components/field-error";
import { PressableScale } from "../components/pressable-scale";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import axiosClient from "../lib/axiosClient";
import { serverFieldErrors, validatePersonName } from "../lib/validation";
import type { ThemePalette } from "../theme/colors";

const COURSE_LABELS: Record<string, string> = {
  BSIT: "BS Information Technology",
  BSCS: "BS Computer Science",
  BSN: "BS Nursing",
  BSBA: "BS Business Administration",
  BSED: "BS Secondary Education",
  BSA: "BS Accountancy",
  BSCE: "BS Civil Engineering",
  BSEE: "BS Electrical Engineering",
};

export default function ProfileScreen() {
  const { currentUser, logout, updateCurrentUser } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [nickname, setNickname] = useState(currentUser?.first_name ?? "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  const userInitial = currentUser?.first_name?.[0]?.toUpperCase() ?? "?";
  const fullName = `${currentUser?.first_name ?? ""} ${currentUser?.last_name ?? ""}`.trim();
  const courseLabel = currentUser?.course ? COURSE_LABELS[currentUser.course] ?? currentUser.course : "—";

  const handleUpdate = async () => {
    const problem = validatePersonName(nickname, "Name");
    setNicknameError(problem);
    if (problem) return;
    setIsUpdating(true);
    try {
      const { data } = await axiosClient.patch("/auth/me/", { first_name: nickname.trim() });
      updateCurrentUser(data);
    } catch (error: any) {
      const { fields, general } = serverFieldErrors(error, "Please try again.");
      if (fields.first_name) {
        setNicknameError(fields.first_name);
      } else {
        Alert.alert("Unable to update", general ?? "Please try again.");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access in your device settings to change your profile picture."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("profile_picture", {
        uri: asset.uri,
        name: asset.fileName ?? "profile.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);
      const { data } = await axiosClient.patch("/auth/me/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      updateCurrentUser(data);
    } catch (error: any) {
      const reason = error.response?.data?.details?.profile_picture?.[0];
      Alert.alert("Unable to update photo", reason ?? "Please try again.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    // Tapping outside the nickname box closes the keyboard (native only - on
    // web it would blur the input on every click).
    <Pressable
      style={styles.screen}
      onPress={Platform.OS === "web" ? undefined : Keyboard.dismiss}
      accessible={false}
    >
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.accentText} />
        </PressableScale>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.identityRow}>
        <PressableScale
          style={styles.avatar}
          onPress={handlePickPhoto}
          disabled={isUploadingPhoto}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          accessibilityState={{ disabled: isUploadingPhoto, busy: isUploadingPhoto }}
        >
          {isUploadingPhoto ? (
            <ActivityIndicator color={colors.accentText} />
          ) : currentUser?.profile_picture ? (
            <Image source={{ uri: currentUser.profile_picture }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{userInitial}</Text>
          )}
          <View style={styles.avatarEditBadge}>
            <MaterialIcons name="edit" size={12} color={colors.white} />
          </View>
        </PressableScale>
        <View>
          <Text style={styles.name}>{fullName || "Student"}</Text>
          <Text style={styles.detail}>{courseLabel}</Text>
          <Text style={styles.detail}>School ID: {currentUser?.school_id ?? "—"}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>What should we call you?</Text>
      <TextInput
        style={[styles.input, nicknameError ? { borderColor: colors.errorRed } : null]}
        value={nickname}
        onChangeText={setNickname}
        placeholder="Nickname"
        placeholderTextColor={colors.textMuted}
        maxLength={150}
      />
      <FieldError message={nicknameError} />
      <PressableScale style={styles.button} onPress={handleUpdate} disabled={isUpdating}>
        <Text style={styles.buttonText}>{isUpdating ? "Updating..." : "Update"}</Text>
      </PressableScale>

      <Text style={styles.sectionLabel}>Account Actions</Text>
      <PressableScale style={styles.button} onPress={handleLogout} disabled={isLoggingOut}>
        <Text style={styles.buttonText}>{isLoggingOut ? "Logging out..." : "Log Out"}</Text>
      </PressableScale>
    </Pressable>
  );
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface, paddingTop: 48, paddingHorizontal: 20 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 24,
    },
    title: { fontSize: 22, fontFamily: "PlusJakartaSans_700Bold", color: colors.textPrimary },
    identityRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 32 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.accentText,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: { width: 56, height: 56 },
    avatarText: { fontFamily: "Montserrat_700Bold", color: colors.accentText, fontSize: 20 },
    avatarEditBadge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.gold,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.surface,
    },
    name: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: colors.textPrimary },
    detail: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: colors.textSecondary },
    sectionLabel: {
      fontFamily: "Montserrat_400Regular",
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 12,
      fontSize: 15,
      fontFamily: "Montserrat_400Regular",
      color: colors.textPrimary,
    },
    button: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 28,
    },
    buttonText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: colors.textPrimary },
  });

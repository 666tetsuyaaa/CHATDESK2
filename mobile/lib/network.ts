import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * Web app only: whether the browser has an internet connection, from its
 * online/offline events. (The phone apps have no connection checker
 * installed, so there this is always true - a failed message still shows its
 * "Try again" button.)
 */
export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(
    () => Platform.OS !== "web" || typeof navigator === "undefined" || navigator.onLine !== false
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}

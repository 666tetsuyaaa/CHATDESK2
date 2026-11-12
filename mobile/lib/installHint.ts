import { useState } from "react";
import { Platform } from "react-native";

const DISMISSED_KEY = "chatdesk_install_hint_dismissed";

// Whether to suggest "Add to Home Screen": only in the web app on an iPhone
// or iPad, only in a browser that can do it (not inside Facebook, Messenger,
// Instagram or LINE), not when ChatDesk was already opened from the Home
// Screen, and only until the student closes the hint once.
function shouldSuggest() {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  if (/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\//i.test(ua)) return false;
  const isStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
  if (isStandalone) return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== "true";
  } catch {
    return true;
  }
}

/** The "Add ChatDesk to your Home Screen" hint: whether to show it, and closing it for good. */
export function useInstallHint() {
  const [visible, setVisible] = useState(shouldSuggest);
  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Private browsing - it just shows again next time.
    }
  };
  return { visible, dismiss };
}

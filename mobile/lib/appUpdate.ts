import { useEffect } from "react";
import { Platform } from "react-native";

// The web app's build is named by its entry script, e.g.
// /_expo/static/js/web/entry-<hash>.js - a new deploy has a new hash.
const ENTRY_SCRIPT = /\/_expo\/static\/js\/web\/entry-[\w-]+\.js/;
// Set after reloading for a version, so a stale cached page can't cause a
// reload loop.
const RELOADED_FOR = "chatdesk_reloaded_for";
// Only after the app was away this long: a quick trip out (picking a profile
// photo, a password manager) mustn't reload in the middle of it.
const AWAY_MS = 60 * 1000;

/** The build this page is running (null in development). */
export function runningBuild(): string | null {
  if (typeof document === "undefined") return null;
  for (const script of Array.from(document.scripts)) {
    const match = script.src.match(ENTRY_SCRIPT);
    if (match) return match[0];
  }
  return null;
}

async function liveBuild(): Promise<string | null> {
  try {
    const response = await fetch(`/?version-check=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.text()).match(ENTRY_SCRIPT)?.[0] ?? null;
  } catch {
    // Offline or the site is busy - try again later.
    return null;
  }
}

// Reloading now would lose something the student is in the middle of:
// typing, or text typed but not sent yet.
function isBusy() {
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return true;
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input")).some(
    (field) => field.type !== "hidden" && field.type !== "checkbox" && field.value.trim() !== ""
  );
}

/**
 * Web only: keeps an open tab on the newest version of the app. A browser
 * tab keeps running the copy of the app it first loaded - for days, if the
 * tab stays open - so fixes deployed since never reached it and old bugs
 * seemed to come back. Each time the student comes back to the app (from
 * another app or tab, or after locking the phone) it checks for a newer
 * version and quietly reloads into it - never while they're typing or have
 * unsent text, and never in the middle of using the app. The chat is saved
 * on the phone and opens again as it was.
 */
export function useWebAppUpdates() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const running = runningBuild();
    if (!running) return;
    let checking = false;
    let hiddenAt = 0;

    const reloadInto = (newer: string) => {
      if (isBusy()) return;
      try {
        if (window.sessionStorage.getItem(RELOADED_FOR) === newer) return;
        window.sessionStorage.setItem(RELOADED_FOR, newer);
      } catch {
        // Storage blocked: still fine to reload once for this version.
      }
      window.location.reload();
    };

    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      const live = await liveBuild();
      checking = false;
      if (live && live !== running) reloadInto(live);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) {
        hiddenAt = 0;
        check();
      }
    };
    // A tab restored from the browser's memory (iPhone browsers keep tabs
    // frozen in the background, then resume them like this).
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}

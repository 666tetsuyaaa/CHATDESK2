import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform } from "react-native";

// How a ScrollView should treat the keyboard when it scrolls.
// Phones: "on-drag" - swiping the content closes the keyboard.
// Web: "none". react-native-web closes the keyboard on *any* scroll event,
// not just a drag, and an iPhone browser scrolls the page by itself after
// every keystroke to keep the cursor in view - so "on-drag" closed the
// keyboard after each letter typed in the web app.
export const KEYBOARD_DISMISS_MODE = Platform.OS === "web" ? "none" : "on-drag";

// Space kept between the field being typed in and the top of the keyboard.
const FIELD_MARGIN = 24;

function scrollableParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

// Scrolls the form so the text box being typed in sits above the keyboard.
// Moves only the form's own scroll area (not the whole page), and only as
// far as needed - a box that is already visible stays where it is.
function revealFocusedField() {
  const active = document.activeElement as HTMLElement | null;
  if (!active || (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA")) return;
  const scroller = scrollableParent(active);
  if (!scroller) return;
  const viewport = window.visualViewport;
  const visibleBottom = Math.min(
    scroller.getBoundingClientRect().bottom,
    viewport ? viewport.offsetTop + viewport.height : window.innerHeight
  );
  const field = active.getBoundingClientRect();
  const overlap = field.bottom + FIELD_MARGIN - visibleBottom;
  if (overlap > 0) scroller.scrollTop += overlap;
}

/**
 * Web only: how many pixels at the bottom of the screen the on-screen
 * keyboard covers (0 on phones' native builds, and on desktop).
 *
 * In the iPhone browser the page keeps its full height when the keyboard
 * opens - the keyboard just covers the bottom of it - so a form that fits
 * the screen has nothing to scroll and its lower fields stay hidden. Screens
 * pad their bottom by this much, which makes the form's scroll area end at
 * the top of the keyboard; the field being typed in is then scrolled into
 * view inside it.
 */
export function useWebKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !window.visualViewport) return;
    const viewport = window.visualViewport;

    const update = () => {
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    };
    // Tapping another field while the keyboard is already open.
    const onFocusIn = () => {
      requestAnimationFrame(revealFocusedField);
    };

    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  // Keyboard opened (or changed height): the screen has re-rendered with the
  // new padding by the time this runs, so the scroll area is the right size.
  useEffect(() => {
    if (Platform.OS !== "web" || inset === 0) return;
    const frame = requestAnimationFrame(revealFocusedField);
    return () => cancelAnimationFrame(frame);
  }, [inset]);

  return inset;
}

/**
 * Whether the on-screen keyboard is open - on phones (from keyboard events)
 * and in the web app (from useWebKeyboardInset). On phones the change is
 * animated in step with the keyboard, so whatever resizes on it moves with
 * the keyboard instead of jumping.
 */
export function useKeyboardOpen() {
  const webOpen = useWebKeyboardInset() > 0;
  const [nativeOpen, setNativeOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const isIOS = Platform.OS === "ios";
    const animate = (duration: number) => {
      const ms = Math.max(duration, 150);
      LayoutAnimation.configureNext({ duration: ms, update: { duration: ms, type: LayoutAnimation.Types.easeInEaseOut } });
    };
    const showSub = Keyboard.addListener(isIOS ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      animate(e.duration);
      setNativeOpen(true);
    });
    const hideSub = Keyboard.addListener(isIOS ? "keyboardWillHide" : "keyboardDidHide", (e) => {
      animate(e.duration);
      setNativeOpen(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return Platform.OS === "web" ? webOpen : nativeOpen;
}

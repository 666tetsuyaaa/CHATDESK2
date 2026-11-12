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

// The browser's full visible height for the current screen width, from
// before any keyboard opened - shared by every screen using the hooks below.
let fullHeight = 0;
let fullWidth = 0;
// A keyboard is at least this tall; smaller changes are the browser's own
// toolbars sliding in and out.
const MIN_KEYBOARD = 150;

type WebKeyboard = { open: boolean; inset: number };
const CLOSED: WebKeyboard = { open: false, inset: 0 };

function measureWebKeyboard(): WebKeyboard {
  const viewport = window.visualViewport;
  if (!viewport) return CLOSED;
  const pageHeight = document.documentElement.clientHeight;
  // Rotating the phone starts over.
  if (Math.abs(window.innerWidth - fullWidth) > 1) {
    fullWidth = window.innerWidth;
    fullHeight = 0;
  }
  fullHeight = Math.max(fullHeight, viewport.height, pageHeight, window.innerHeight);
  // Browsers report an open keyboard in different ways: some shrink only the
  // visible area (the page stays full height under the keyboard), some shrink
  // the page too, and an iPhone may also report its window as shrunk. Compared
  // with the full height seen before typing, the visible area is smaller by
  // about the keyboard's height in every case.
  // A keyboard only opens for a text box - this also stops a desktop browser
  // window that is made shorter from counting as one.
  const active = document.activeElement;
  const typing = !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  const open = typing && fullHeight - viewport.height >= MIN_KEYBOARD;
  // How much of the page itself is hidden behind the keyboard (0 when the
  // browser already shrank the page to fit above it).
  const inset = open ? Math.max(0, Math.round(pageHeight - viewport.height - viewport.offsetTop)) : 0;
  return { open, inset };
}

/**
 * Web only: whether the on-screen keyboard is open, and how many pixels at
 * the bottom of the page it covers (`inset`). Always closed on phones' native
 * builds and on desktop.
 *
 * In the iPhone browser the page can keep its full height when the keyboard
 * opens - the keyboard just covers the bottom of it - so a form that fits
 * the screen has nothing to scroll and its lower fields stay hidden. Screens
 * pad their bottom by `inset`, which makes the form's scroll area end at the
 * top of the keyboard; the field being typed in is then scrolled into view.
 */
export function useWebKeyboard(): WebKeyboard {
  const [state, setState] = useState<WebKeyboard>(CLOSED);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !window.visualViewport) return;
    const viewport = window.visualViewport;

    const update = () => {
      const next = measureWebKeyboard();
      setState((prev) => (prev.open === next.open && prev.inset === next.inset ? prev : next));
    };
    // Tapping another field while the keyboard is already open.
    const onFocusIn = () => {
      update();
      requestAnimationFrame(revealFocusedField);
    };
    // Leaving a text box (the keyboard is closing).
    const onFocusOut = () => requestAnimationFrame(update);

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Keyboard opened (or changed height): the screen has re-rendered by the
  // time this runs. An iPhone may have slid the whole page up to show the
  // text box - put it back, since the screen now fits above the keyboard -
  // then bring the box into view inside the form.
  useEffect(() => {
    if (Platform.OS !== "web" || !state.open) return;
    const frame = requestAnimationFrame(() => {
      if (window.scrollY > 0 || (window.visualViewport?.offsetTop ?? 0) > 0) window.scrollTo(0, 0);
      revealFocusedField();
    });
    return () => cancelAnimationFrame(frame);
  }, [state.open, state.inset]);

  return state;
}

/** Web only: pixels of the page the keyboard covers (see useWebKeyboard). */
export function useWebKeyboardInset() {
  return useWebKeyboard().inset;
}

/**
 * Whether the on-screen keyboard is open - on phones (from keyboard events)
 * and in the web app (from useWebKeyboard). On phones the change is
 * animated in step with the keyboard, so whatever resizes on it moves with
 * the keyboard instead of jumping.
 */
export function useKeyboardOpen() {
  const webOpen = useWebKeyboard().open;
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

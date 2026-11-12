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

// inset: how much of the app is behind the keyboard - 0, since the app is
// pinned above it. overlayInset: how much of the screen the keyboard covers,
// for pop-ups (React Native's Modal is drawn outside the app's root, so the
// pinning doesn't move them - they lift their content by this much).
// iPhones scroll *any* box around the text cursor to keep it in view - even
// boxes that aren't meant to scroll (overflow hidden), such as the app's own
// screen containers - which can leave a whole screen shifted inside the app.
// Only real scroll areas (overflow auto/scroll: message lists, forms) may
// scroll; anything else that gets scrolled is put straight back.
let scrollGuardInstalled = false;
function installScrollGuard() {
  if (scrollGuardInstalled || typeof document === "undefined") return;
  scrollGuardInstalled = true;
  document.addEventListener(
    "scroll",
    (event) => {
      const box = event.target;
      if (!(box instanceof HTMLElement) || box.scrollTop === 0 && box.scrollLeft === 0) return;
      const { overflowX, overflowY } = getComputedStyle(box);
      const scrollable = (value: string) => value === "auto" || value === "scroll";
      if (!scrollable(overflowY) && box.scrollTop !== 0) box.scrollTop = 0;
      if (!scrollable(overflowX) && box.scrollLeft !== 0) box.scrollLeft = 0;
    },
    true
  );
}

function isTextField(element: EventTarget | null) {
  const tag = (element as HTMLElement | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

type WebKeyboard = { open: boolean; inset: number; overlayInset: number };
const CLOSED: WebKeyboard = { open: false, inset: 0, overlayInset: 0 };

const PINNED = ["position", "top", "left", "right", "height"] as const;

/**
 * While the keyboard is open, the whole app is pinned to exactly the part of
 * the screen the browser shows above it. An iPhone slides the page around
 * when the keyboard opens (and while you drag), in ways that differ between
 * Safari, Chrome and iOS versions; pinned to the visible area, the header
 * stays at its top and the text box sits just above the keyboard whatever
 * the browser does. Released when the keyboard closes.
 */
function pinAppToVisibleArea(open: boolean, viewport: VisualViewport) {
  const root = document.getElementById("root");
  if (!root) return;
  if (open) {
    root.style.position = "fixed";
    root.style.left = "0";
    root.style.right = "0";
    root.style.top = `${Math.round(viewport.offsetTop)}px`;
    root.style.height = `${Math.round(viewport.height)}px`;
  } else if (root.style.position === "fixed") {
    for (const property of PINNED) root.style.removeProperty(property);
  }
}

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
  const typing = isTextField(document.activeElement);
  const open = typing && fullHeight - viewport.height >= MIN_KEYBOARD;
  pinAppToVisibleArea(open, viewport);
  // The app now fits above the keyboard, so none of it is hidden behind the
  // keyboard and screens need no extra bottom space (inset stays 0).
  const overlayInset = open ? Math.max(0, Math.round(pageHeight - viewport.height - viewport.offsetTop)) : 0;
  return { open, inset: 0, overlayInset };
}

/**
 * Web only: whether the on-screen keyboard is open (always closed on phones'
 * native builds and on desktop). While it is, the app is pinned to the area
 * above the keyboard (see pinAppToVisibleArea), so a form's lower fields can
 * scroll into view; `inset` - the part of the app behind the keyboard - is
 * therefore 0.
 */
export function useWebKeyboard(): WebKeyboard {
  const [state, setState] = useState<WebKeyboard>(CLOSED);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !window.visualViewport) return;
    const viewport = window.visualViewport;
    installScrollGuard();

    const update = () => {
      const next = measureWebKeyboard();
      setState((prev) =>
        prev.open === next.open && prev.inset === next.inset && prev.overlayInset === next.overlayInset ? prev : next
      );
    };
    // Focus leaving a text box (to a button, or nowhere). The keyboard
    // closing is picked up from the viewport resizing; this is only a
    // fallback, and it waits: reacting at once rearranged the screen (tab
    // bar back, app unpinned) in the middle of the tap that moved the focus -
    // pressing Send with the keyboard open gives the button focus - so the
    // button jumped away before the tap finished, the message wasn't sent and
    // the app could stay unpinned behind a keyboard that was still open.
    let focusOutTimer: ReturnType<typeof setTimeout> | undefined;
    const updateSoon = () => {
      clearTimeout(focusOutTimer);
      focusOutTimer = setTimeout(update, 350);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isTextField(event.target)) {
        // Tapping another text box while the keyboard is open.
        clearTimeout(focusOutTimer);
        update();
        requestAnimationFrame(revealFocusedField);
      } else {
        updateSoon();
      }
    };
    const onFocusOut = updateSoon;

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
      clearTimeout(focusOutTimer);
    };
  }, []);

  // Keyboard opened: the screen has re-rendered (pinned above the keyboard)
  // by the time this runs - bring the text box into view inside its form.
  useEffect(() => {
    if (Platform.OS !== "web" || !state.open) return;
    const frame = requestAnimationFrame(revealFocusedField);
    // Again once the sign-in header has finished shrinking (a 220ms
    // transition), since that moves the text box.
    const settled = setTimeout(revealFocusedField, 280);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [state.open, state.overlayInset]);

  return state;
}

/** Web only: pixels of the app behind the keyboard - 0 while it's pinned above it (see useWebKeyboard). */
export function useWebKeyboardInset() {
  return useWebKeyboard().inset;
}

/** Web only: pixels of the screen the keyboard covers, for pop-ups (Modal) - see useWebKeyboard. */
export function useWebKeyboardOverlayInset() {
  return useWebKeyboard().overlayInset;
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

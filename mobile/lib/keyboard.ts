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
// toolbars sliding in and out. (Only used on computers - see below.)
const MIN_KEYBOARD = 150;
// After the text box loses focus the keyboard slides away; the app follows
// it down until it is gone, for at most this long (some browsers never
// quite report the full height again).
const CLOSING_MS = 1200;
// Fully gone (a pixel of rounding aside) - handing back earlier, while the
// page was still a little short, moved the message box.
const CLOSED_BELOW = 2;
let closingUntil = 0;
// A phone or tablet: tapping a text box opens an on-screen keyboard.
export const isTouchScreen = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

// inset: how much of the app is behind the keyboard - 0, since the app is
// pinned above it. overlayInset: how much of the screen the keyboard covers,
// for pop-ups (React Native's Modal is drawn outside the app's root, so the
// pinning doesn't move them - they lift their content by this much).
// iPhones scroll *any* box around the text cursor to keep it in view - even
// boxes that aren't meant to scroll (overflow hidden), such as the app's own
// screen containers - which can leave a whole screen shifted inside the app.
// Only real scroll areas (overflow auto/scroll: message lists, forms) may
// scroll; anything else that gets scrolled is put straight back.
function putBack(box: HTMLElement) {
  if (box.scrollTop === 0 && box.scrollLeft === 0) return;
  const { overflowX, overflowY } = getComputedStyle(box);
  const scrollable = (value: string) => value === "auto" || value === "scroll";
  if (!scrollable(overflowY) && box.scrollTop !== 0) box.scrollTop = 0;
  if (!scrollable(overflowX) && box.scrollLeft !== 0) box.scrollLeft = 0;
}

let scrollGuardInstalled = false;
function installScrollGuard() {
  if (scrollGuardInstalled || typeof document === "undefined") return;
  scrollGuardInstalled = true;
  document.addEventListener(
    "scroll",
    (event) => {
      if (event.target instanceof HTMLElement) putBack(event.target);
    },
    true
  );
}

// Set on a text box (by the screen that owns it) to the space kept below it
// while typing - see pinAppToVisibleArea.
export const KEYBOARD_REST_ATTRIBUTE = "data-keyboard-rest";

// The text box last typed in. The iPhone doesn't always send a scroll event
// when it shifts the boxes around it, so after the keyboard opens or closes
// every box from that text box up to the page is checked and put back too.
let lastField: HTMLElement | null = null;
function putBackAroundField() {
  for (let box = lastField?.parentElement ?? null; box && box !== document.documentElement; box = box.parentElement) {
    putBack(box);
  }
}
let settleTimers: ReturnType<typeof setTimeout>[] = [];
function putBackWhenSettled() {
  settleTimers.forEach(clearTimeout);
  // Once at once and again after the keyboard's ~300ms slide has finished.
  settleTimers = [0, 120, 450].map((ms) => setTimeout(putBackAroundField, ms));
}

function isTextField(element: EventTarget | null) {
  const tag = (element as HTMLElement | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

type WebKeyboard = { open: boolean; inset: number; overlayInset: number };
const CLOSED: WebKeyboard = { open: false, inset: 0, overlayInset: 0 };

const PINNED = ["position", "top", "left", "right", "height", "transition"] as const;

// Some iPhones report the keyboard only once it has finished sliding, so
// following the reports left the message box behind the keyboard for the
// whole slide and then jumped it up. Like chat apps, the app instead moves
// with the keyboard it knows is coming: frame by frame along an iPhone
// keyboard's own slide (about 250ms, fast start, soft landing), to the
// height the keyboard had last time - by the same rule as the real numbers
// (see pinAppToVisibleArea) - and hands over to the real numbers when they
// arrive. Browsers that report the keyboard every frame while it slides
// need none of this - the app learns which kind it is on (see
// reportsWhileSliding) and only predicts for the other kind.
const SLIDE_MS = 250;
// Closing a touch slower: if the timing is off, the box stays just above
// the keyboard instead of slipping behind it.
const CLOSE_SLIDE_MS = 300;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
// The last small correction once the real numbers arrive.
const GLIDE = "height 120ms ease-out";
// No keyboard after this long (e.g. a tablet with a keyboard attached):
// slide back.
const PREDICT_WAIT_MS = 800;
// A first guess before any keyboard was seen: about this much of the screen.
const FIRST_GUESS = 0.45;
const keyboardKey = () => `chatdesk_keyboard_height_${Math.round(fullWidth)}`;
type Prediction = {
  covered: number; // the real numbers when the prediction started
  offsetTop: number;
  until: number;
  frame: number;
  done: boolean; // finished its slide
  opening: boolean;
  keyboard: number; // where the predicted keyboard is now
  field: HTMLElement | null;
};
let prediction: Prediction | null = null;
let openCoveredMax = 0;

// Whether this browser reports the keyboard while it slides (several
// heights in a row) rather than only once it has stopped. Learned from each
// opening and remembered; unknown (null) until the first one.
const LIVE_KEY = "chatdesk_keyboard_reports_live";
let reportsLive: boolean | null = null;
let openingHeights = new Set<number>();
let openingStarted = 0;
function reportsWhileSliding(): boolean | null {
  if (reportsLive === null) {
    try {
      const saved = window.localStorage.getItem(LIVE_KEY);
      if (saved === "1" || saved === "0") reportsLive = saved === "1";
    } catch {
      // Storage blocked - learned again in this visit.
    }
  }
  return reportsLive;
}
function learnHowKeyboardReports() {
  // 0, at least one height in between, and the final height.
  if (openingHeights.size === 0) return;
  reportsLive = openingHeights.size >= 3;
  openingHeights = new Set();
  try {
    window.localStorage.setItem(LIVE_KEY, reportsLive ? "1" : "0");
  } catch {
    // Storage blocked - learned again in this visit.
  }
}

function rememberedKeyboard() {
  try {
    const saved = Number(window.localStorage.getItem(keyboardKey()));
    if (saved >= MIN_KEYBOARD) return saved;
  } catch {
    // Storage blocked - use the guess.
  }
  return Math.round(fullHeight * FIRST_GUESS);
}

function rememberKeyboard(height: number) {
  if (height < MIN_KEYBOARD) return;
  try {
    window.localStorage.setItem(keyboardKey(), String(Math.round(height)));
  } catch {
    // Storage blocked - the guess is used next time.
  }
}

// The app's height with `keyboard` px of keyboard showing, below a text box
// that keeps `rest` px of space under it (see pinAppToVisibleArea).
const appHeight = (visibleWithoutKeyboard: number, keyboard: number, rest: number) =>
  visibleWithoutKeyboard - keyboard + Math.min(keyboard, rest);

function stopPrediction() {
  if (prediction) cancelAnimationFrame(prediction.frame);
  prediction = null;
}

/** Moves the pinned app along a keyboard sliding from `from` to `to` px. */
function slideWithKeyboard(field: HTMLElement | null, from: number, to: number, opening: boolean) {
  const viewport = window.visualViewport;
  const root = document.getElementById("root");
  if (!viewport || !root || root.style.position !== "fixed") return;
  stopPrediction();
  const covered = Math.max(0, Math.round(fullHeight - viewport.height));
  const visibleWithoutKeyboard = fullHeight - viewport.offsetTop;
  const rest = Number(field?.getAttribute(KEYBOARD_REST_ATTRIBUTE)) || 0;
  const started = performance.now();
  const duration = opening ? SLIDE_MS : CLOSE_SLIDE_MS;
  root.style.transition = "";
  const step = () => {
    const t = Math.min(1, (performance.now() - started) / duration);
    const keyboard = from + (to - from) * easeOut(t);
    root.style.height = `${Math.round(appHeight(visibleWithoutKeyboard, keyboard, rest))}px`;
    if (!prediction) return;
    prediction.keyboard = keyboard;
    if (t < 1) prediction.frame = requestAnimationFrame(step);
    else prediction.done = true;
  };
  prediction = { covered, offsetTop: viewport.offsetTop, until: Date.now() + PREDICT_WAIT_MS, frame: 0, done: false, opening, keyboard: from, field };
  step();
}

/** A text box was tapped on a phone: move with the keyboard that is coming. */
function predictKeyboardOpening(field: HTMLElement) {
  // Several screens heard the same tap (a new tap right after closing the
  // keyboard is not one of these).
  if (prediction?.opening && prediction.field === field) return;
  const viewport = window.visualViewport;
  if (!viewport) return;
  const covered = Math.max(0, Math.round(fullHeight - viewport.height));
  if (covered >= MIN_KEYBOARD) return; // already open (moving between text boxes)
  openingHeights = new Set([covered]);
  openingStarted = Date.now();
  // The browser shows the keyboard as it slides - just follow it.
  if (reportsWhileSliding() === true) return;
  slideWithKeyboard(field, covered, rememberedKeyboard(), true);
}

/** The text box was let go on a phone: move down with the keyboard leaving. */
function predictKeyboardClosing() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  rememberKeyboard(openCoveredMax);
  openCoveredMax = 0;
  learnHowKeyboardReports();
  // Predicted only for a browser known to report the keyboard just once.
  if (reportsWhileSliding() !== false) return;
  const covered = Math.max(0, Math.round(fullHeight - viewport.height));
  // Not when the page itself is shorter (Chrome on Android resizing it with
  // the keyboard - see interactive-widget in scripts/finish-web-export.mjs):
  // the browser then moves everything down with the keyboard by itself.
  const pageResizes = document.documentElement.clientHeight < fullHeight - MIN_KEYBOARD / 2;
  if (covered >= MIN_KEYBOARD && !pageResizes) slideWithKeyboard(lastField, covered, 0, false);
}

/**
 * While the keyboard is open, the whole app is pinned to exactly the part of
 * the screen the browser shows above it. An iPhone slides the page around
 * when the keyboard opens (and while you drag), in ways that differ between
 * Safari, Chrome and iOS versions; pinned to the visible area, the header
 * stays at its top and the text box sits just above the keyboard whatever
 * the browser does. Released when the keyboard closes.
 */
function pinAppToVisibleArea(open: boolean, viewport: VisualViewport, covered: number) {
  const root = document.getElementById("root");
  if (!root) return;
  if (open) {
    root.style.position = "fixed";
    root.style.left = "0";
    root.style.right = "0";
    root.style.top = `${Math.round(viewport.offsetTop)}px`;
    // A text box with a resting space below it (the chat's message box -
    // see KEYBOARD_REST_ATTRIBUTE) keeps that space fixed while typing; the
    // app reaches that much further down, behind the keyboard, until the
    // keyboard has covered it. So the box stays still until the keyboard
    // reaches it, then rides on it - all decided here, in the same moment
    // the browser reports the keyboard, with no re-render in between.
    const rest = Number(lastField?.getAttribute(KEYBOARD_REST_ATTRIBUTE)) || 0;
    const height = viewport.height + Math.min(covered, rest);
    let glide = false;
    if (prediction) {
      const unchanged =
        Math.abs(covered - prediction.covered) <= 2 && Math.abs(viewport.offsetTop - prediction.offsetTop) <= 2;
      // Nothing new from the browser yet: keep moving with the keyboard.
      if (unchanged && Date.now() < prediction.until) return;
      // The real keyboard is still below the predicted one while it opens:
      // keep going until it catches up - never move the box back down.
      if (prediction.opening && !prediction.done && covered < prediction.keyboard) return;
      // The real numbers. Arriving after the slide (a browser that reports
      // the keyboard only once it has stopped): a small correction glides
      // there - as does sliding back when no keyboard came. Arriving during
      // the slide (a browser reporting every frame): taken over directly.
      glide = unchanged || (prediction.done && Math.abs(height - root.getBoundingClientRect().height) <= 80);
      stopPrediction();
    }
    root.style.transition = glide ? GLIDE : "";
    root.style.height = `${Math.round(height)}px`;
  } else if (root.style.position === "fixed") {
    stopPrediction();
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
  const covered = Math.max(0, Math.round(fullHeight - viewport.height));
  const typing = isTextField(document.activeElement);
  // Like chat apps: on a phone the keyboard layout starts the moment a text
  // box is tapped (not halfway up the keyboard's slide, which made the screen
  // snap), and lasts while the keyboard slides away again. On a computer a
  // text box opens no keyboard - only a big enough drop in height counts, so
  // a browser window made shorter doesn't.
  const open = isTouchScreen()
    ? typing || (Date.now() < closingUntil && covered >= CLOSED_BELOW)
    : typing && covered >= MIN_KEYBOARD;
  if (open && typing) {
    openCoveredMax = Math.max(openCoveredMax, covered);
    if (openingStarted && Date.now() - openingStarted < PREDICT_WAIT_MS) openingHeights.add(covered);
  }
  pinAppToVisibleArea(open, viewport, covered);
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
      putBackWhenSettled();
      setState((prev) =>
        prev.open === next.open &&
        prev.inset === next.inset &&
        prev.overlayInset === next.overlayInset
          ? prev
          : next
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
        lastField = event.target as HTMLElement;
        closingUntil = 0;
        // Tapping another text box while the keyboard is open.
        clearTimeout(focusOutTimer);
        update();
        if (isTouchScreen()) {
          predictKeyboardOpening(event.target as HTMLElement);
          setTimeout(update, PREDICT_WAIT_MS + 20);
        }
        requestAnimationFrame(revealFocusedField);
      } else {
        updateSoon();
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      // A text box let go: the keyboard now slides away - follow it down.
      if (isTextField(event.target)) {
        closingUntil = Date.now() + CLOSING_MS;
        setTimeout(update, CLOSING_MS + 50);
        // Not when the focus just moves to another text box.
        const next = event.relatedTarget;
        if (isTouchScreen() && !isTextField(next)) {
          predictKeyboardClosing();
          setTimeout(update, PREDICT_WAIT_MS + 20);
        }
      }
      updateSoon();
    };

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

let homeIndicator: number | null = null;
/**
 * Web only: the phone's home-indicator area at the bottom of the screen
 * (env(safe-area-inset-bottom), e.g. 34px on iPhones without a home
 * button). It doesn't change while the keyboard moves, unlike the safe-area
 * insets the layout library re-measures a moment after each change.
 */
export function webHomeIndicatorHeight(): number {
  if (Platform.OS !== "web" || typeof document === "undefined") return 0;
  if (homeIndicator === null) {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom, 0px)";
    document.body.appendChild(probe);
    homeIndicator = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
  }
  return homeIndicator;
}

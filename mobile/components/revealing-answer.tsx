import { useEffect, useMemo, useState } from "react";
import type { TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { FormattedAnswer } from "./formatted-answer";
import { prefersReducedMotionOnWeb } from "../lib/motion";

// How the reply is revealed: a few words every 30ms, finishing within about
// 1.2s however long the reply is (short replies take less).
const TICK_MS = 30;
const MAX_TICKS = 40;

/**
 * A ChatDesk reply that appears word by word when it has just arrived, so
 * the wait feels shorter and the answer reads like it's being written. The
 * whole reply is already here - this only paces how it's shown. Older
 * messages (and phones set to reduce motion) show the full text at once.
 */
export function RevealingAnswer({
  text,
  animate,
  onRevealed,
  style,
}: {
  text: string;
  animate: boolean;
  onRevealed?: () => void;
  style: TextStyle;
}) {
  const reduceMotion = useReducedMotion() || prefersReducedMotionOnWeb();
  const shouldAnimate = animate && !reduceMotion;
  // Words with the spaces/line breaks after them, so the layout is kept.
  const pieces = useMemo(() => text.match(/\S+\s*|\s+/g) ?? [text], [text]);
  const [shown, setShown] = useState(shouldAnimate ? 0 : pieces.length);

  useEffect(() => {
    if (!shouldAnimate) return;
    const step = Math.max(1, Math.ceil(pieces.length / MAX_TICKS));
    const timer = setInterval(() => {
      setShown((count) => {
        const next = Math.min(pieces.length, count + step);
        if (next >= pieces.length) clearInterval(timer);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [shouldAnimate, pieces.length]);

  const isComplete = shown >= pieces.length;
  useEffect(() => {
    if (isComplete) onRevealed?.();
    // Only when it completes - onRevealed is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const visible = isComplete ? text : pieces.slice(0, shown).join("");
  return <FormattedAnswer text={visible} style={style} />;
}

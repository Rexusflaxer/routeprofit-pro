import React from "react";

const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE = 12;

export default function useTouchContextMenu() {
  const timerRef = React.useRef(null);
  const startRef = React.useRef(null);
  const suppressClickRef = React.useRef(false);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = event => {
    if (!['touch', 'pen'].includes(event.pointerType)) return;
    clearTimer();
    startRef.current = { x: event.clientX, y: event.clientY, target: event.currentTarget };
    timerRef.current = window.setTimeout(() => {
      const start = startRef.current;
      if (!start) return;
      suppressClickRef.current = true;
      start.target.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: start.x,
        clientY: start.y,
        button: 2,
      }));
    }, LONG_PRESS_MS);
  };

  const onPointerMove = event => {
    const start = startRef.current;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) <= MOVE_TOLERANCE) return;
    clearTimer();
    startRef.current = null;
  };

  const finishPress = () => {
    clearTimer();
    startRef.current = null;
  };

  const onClickCapture = event => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { onPointerDown, onPointerMove, onPointerUp: finishPress, onPointerCancel: finishPress, onClickCapture };
}
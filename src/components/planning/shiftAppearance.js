export function shiftTimeOverlayClass(startTime) {
  const hour = Number(String(startTime || "00:00").split(":")[0]);
  if (hour >= 5 && hour < 14) return "!bg-shift-early/20 dark:!bg-shift-early/15";
  if (hour >= 14 && hour < 22) return "!bg-shift-evening/20 dark:!bg-shift-evening/15";
  return "!bg-shift-night/20 dark:!bg-shift-night/15";
}
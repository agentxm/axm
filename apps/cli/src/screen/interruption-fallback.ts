import { encodeMachineEvent, errorEvent } from "./machine-events.js";
import { CURSOR_SHOW } from "./terminal-style.js";

/** Bytes for the sanctioned second-signal fallback after the Screen cannot finish. */
export const interruptionFallback = (signal: "SIGINT" | "SIGTERM", machine: boolean): string => {
  const message = `Cancelled by ${signal}.`;
  return machine
    ? encodeMachineEvent(errorEvent("interrupted", message, { reason: "interrupted", signal }))
    : `${CURSOR_SHOW}${message}\n`;
};

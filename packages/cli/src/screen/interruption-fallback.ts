import { encodeMachineEvent, errorEvent } from "./machine-events.js";

const CURSOR_SHOW = "\u001b[?25h";

/** Bytes for the sanctioned second-signal fallback after the Screen cannot finish. */
export const interruptionFallback = (signal: "SIGINT" | "SIGTERM", machine: boolean): string => {
  const message = `Cancelled by ${signal}.`;
  return `${CURSOR_SHOW}${
    machine
      ? encodeMachineEvent(errorEvent("interrupted", message, { reason: "interrupted", signal }))
      : `${message}\n`
  }`;
};

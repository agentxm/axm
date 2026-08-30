/**
 * Process-level interruption signal record.
 *
 * The signal handler is a process-entry adapter: it records which signal
 * requested termination so the operation boundary — which resolves the
 * interruption through the normal lifecycle — can state it. Only the first
 * signal is recorded; a second signal forces exit through the fallback path.
 */

let requestedSignal: "SIGINT" | "SIGTERM" | undefined;

export const recordInterruptionSignal = (signal: "SIGINT" | "SIGTERM"): void => {
  requestedSignal ??= signal;
};

export const requestedInterruptionSignal = (): "SIGINT" | "SIGTERM" | undefined => requestedSignal;

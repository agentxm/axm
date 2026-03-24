import * as Option from "effect/Option";
import type { OutputFormat } from "../output-format.js";

/**
 * Resolve output format from raw argv BEFORE Effect runs.
 *
 * If CLI parsing itself fails (e.g. unknown flag), Effect never executes —
 * but we still need to know which channel to route the error to.
 * Raw argv scanning is the only reliable approach here.
 */
export const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat => {
  const idx = args.indexOf("--output-format");
  if (idx !== -1 && idx + 1 < args.length) {
    const value = args[idx + 1];
    if (value === "json" || value === "stream-json" || value === "text") return value;
  }
  return process.stdout.isTTY ? "text" : "json";
};

/**
 * Resolve output format from an Effect Option (from the global flag)
 * with TTY-based auto-detection fallback.
 */
export const resolveFormat = (
  explicit: Option.Option<OutputFormat>,
  options?: { readonly isLongRunning?: boolean },
): OutputFormat =>
  Option.getOrElse(explicit, () =>
    process.stdout.isTTY ? "text" : options?.isLongRunning ? "stream-json" : "json",
  );

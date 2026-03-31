import * as Option from "effect/Option";
import type { OutputFormat } from "./output-mode.js";

/** Check if running in a TTY. Falls back to stderr when stdout is piped (e.g. through pnpm). */
const isTTY = (): boolean => Boolean(process.stdout.isTTY || process.stderr.isTTY);

/**
 * Resolve output format from raw argv BEFORE Effect runs.
 *
 * If CLI parsing itself fails (e.g. unknown flag), Effect never executes —
 * but we still need to know which channel to route the error to.
 * Raw argv scanning is the only reliable approach here.
 */
export const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat => {
  if (args.includes("--json")) {
    return "json";
  }
  return isTTY() ? "text" : "json";
};

/**
 * Resolve output format from an Effect Option (from the global flag)
 * with TTY-based auto-detection fallback.
 */
export const resolveFormat = (explicitJson: Option.Option<boolean>): OutputFormat =>
  Option.getOrElse(explicitJson, () => false) ? "json" : isTTY() ? "text" : "json";

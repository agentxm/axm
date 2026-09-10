import * as Option from "effect/Option";
import type { OutputFormat } from "./output-mode.js";

const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");

/**
 * Resolve output format from raw argv BEFORE Effect runs.
 *
 * If CLI parsing itself fails (e.g. unknown flag), Effect never executes, so
 * raw argv scanning is the only reliable way to preserve explicit --json.
 */
export const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat => {
  return hasExplicitJsonFlag(args) ? "json" : "text";
};

/**
 * Resolve output format from the global flag.
 * Text remains the default unless --json was explicitly requested.
 */
export const resolveFormat = (explicitJson: Option.Option<boolean>): OutputFormat =>
  Option.getOrElse(explicitJson, () => false) ? "json" : "text";

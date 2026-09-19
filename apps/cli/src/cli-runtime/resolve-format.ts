import * as Option from "effect/Option";
import type { OutputFormat } from "./output-mode.js";

/** Only arguments before `--` can be options. */
export const optionArgs = (args: ReadonlyArray<string>): ReadonlyArray<string> => {
  const end = args.indexOf("--");
  return end === -1 ? args : args.slice(0, end);
};

export const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean => {
  const options = optionArgs(args);
  return options.includes("--json") || options.includes("-j");
};

/** Every `--output` value, in both `--output value` and `--output=value` forms. */
export const outputSelectorsFromArgv = (args: ReadonlyArray<string>): ReadonlyArray<string> =>
  optionArgs(args).flatMap((arg, index, options) =>
    arg.startsWith("--output=")
      ? [arg.slice("--output=".length)]
      : arg === "--output" && options[index + 1] !== undefined
        ? [options[index + 1] ?? ""]
        : [],
  );

/**
 * Resolve output format from raw argv BEFORE Effect runs.
 *
 * If CLI parsing itself fails (e.g. unknown flag), Effect never executes, so
 * raw argv scanning is the only reliable way to preserve explicit --json or
 * to keep diagnostics off a stdout that carries a raw credential.
 */
export const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat => {
  // Raw credential output owns stdout even when the rest of argv is invalid,
  // so its diagnostics take the text route to stderr whatever else is asked.
  if (outputSelectorsFromArgv(args).includes("token")) return "text";
  return hasExplicitJsonFlag(args) ? "json" : "text";
};

/**
 * Resolve output format from the global flag.
 * Text remains the default unless --json was explicitly requested.
 */
export const resolveFormat = (explicitJson: Option.Option<boolean>): OutputFormat =>
  Option.getOrElse(explicitJson, () => false) ? "json" : "text";

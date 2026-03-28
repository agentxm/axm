import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

// ---------------------------------------------------------------------------
// Global flag definitions (parsed by Effect CLI at the root command level)
// ---------------------------------------------------------------------------

export { isCI, isNonInteractive, nonInteractiveFlag } from "./non-interactive.js";
import { nonInteractiveFlag } from "./non-interactive.js";

export const outputFormatFlag = GlobalFlag.setting("axm-output-format")({
  flag: Flag.choice("output-format", ["text", "json", "stream-json"] as const).pipe(
    Flag.withDescription("Output format (default: auto-detect from TTY)"),
    Flag.optional,
  ),
});

export const verboseFlag = GlobalFlag.setting("axm-verbose")({
  flag: Flag.boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show additional diagnostic details for errors"),
  ),
});

export const debugFlag = GlobalFlag.setting("axm-debug")({
  flag: Flag.boolean("debug").pipe(
    Flag.withDescription("Show full debug details for errors (implies --verbose)"),
  ),
});

export const quietFlag = GlobalFlag.setting("axm-quiet")({
  flag: Flag.boolean("quiet").pipe(
    Flag.withAlias("q"),
    Flag.withDescription("Suppress non-essential output"),
  ),
});

export { resolveVerbosityFromArgv } from "./resolve-verbosity.js";

// ---------------------------------------------------------------------------
// Verbosity
// ---------------------------------------------------------------------------

export {
  LevelOrder,
  Verbosity,
  type VerbosityLevel,
  makeVerbosityLayer,
  verbosityToLogLevel,
} from "./verbosity.js";
export { whenDebug, whenNotQuiet, whenVerbose } from "./verbosity-helpers.js";

// ---------------------------------------------------------------------------
// Per-command flag definitions — import and include in Command.make() flags
// for commands that need them. Not global — they only appear in --help for
// commands that declare them.
// ---------------------------------------------------------------------------

export const yesFlag = Flag.boolean("yes").pipe(
  Flag.withAlias("y"),
  Flag.withDescription("Auto-accept confirmation prompts"),
);

export const forceFlag = Flag.boolean("force").pipe(
  Flag.withAlias("f"),
  Flag.withDescription("Override constraints that would cause failure"),
);

export const previewFlag = Flag.boolean("preview").pipe(
  Flag.withDescription("Display plan without applying"),
);

export const jsonFlag = Flag.boolean("json").pipe(Flag.withDescription("Output as JSON"));

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

import { makeVerbosityLayer, type VerbosityLevel } from "./verbosity.js";

export const TestFlagsLayer = (overrides?: {
  verbose?: boolean;
  debug?: boolean;
  nonInteractive?: boolean;
}) => {
  const level: VerbosityLevel = overrides?.debug
    ? "debug"
    : overrides?.verbose
      ? "verbose"
      : "normal";
  return Layer.mergeAll(
    makeVerbosityLayer(level),
    Layer.succeed(
      nonInteractiveFlag,
      overrides?.nonInteractive === undefined
        ? Option.some(true)
        : Option.some(overrides.nonInteractive),
    ),
  );
};

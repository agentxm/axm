import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

// ---------------------------------------------------------------------------
// Global flag definitions (parsed by Effect CLI at the root command level)
// ---------------------------------------------------------------------------

export {
  isNonInteractive,
  isNonInteractiveOptional,
  nonInteractiveFlag,
} from "./non-interactive.js";
import { nonInteractiveFlag } from "./non-interactive.js";

export const jsonFlag = GlobalFlag.setting("axm-json")({
  flag: Flag.boolean("json").pipe(
    Flag.withAlias("j"),
    Flag.withDescription("Output machine-readable JSON"),
    Flag.optional,
  ),
});

export const verboseFlag = GlobalFlag.setting("axm-verbose")({
  flag: Flag.boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show additional redacted diagnostic details for errors"),
    Flag.withDefault(false),
  ),
});

export const debugFlag = GlobalFlag.setting("axm-debug")({
  flag: Flag.boolean("debug").pipe(
    Flag.withDescription("Show redacted cause and stack details (implies --verbose)"),
    Flag.withDefault(false),
  ),
});

export const quietFlag = GlobalFlag.setting("axm-quiet")({
  flag: Flag.boolean("quiet").pipe(
    Flag.withAlias("q"),
    Flag.withDescription("Show only final outcomes, errors, and required actions"),
    Flag.withDefault(false),
  ),
});

export const directoryFlag = GlobalFlag.setting("axm-directory")({
  flag: Flag.directory("directory", { mustExist: true }).pipe(
    Flag.withAlias("C"),
    Flag.withDescription(
      "Run as if AXM was started in this directory (relative paths resolve from there)",
    ),
    Flag.optional,
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
  Flag.withDefault(false),
);

/**
 * Every override flag the CLI exposes, declared with the one policy it
 * bypasses. This object is the definition site: an override flag is built
 * from a row here, so a new one cannot enter the surface without naming its
 * policy, and the conformance specification reads these rows rather than a
 * hand-copied table. `policy` is the lowercase phrase every rendered help
 * description for that flag must contain.
 */
const OVERRIDE_FLAG_DECLARATIONS = {
  reinstall: {
    policy: "reinstall",
    description: "Reinstall content that is already installed",
  },
  refresh: {
    policy: "current",
    description: "Run update even when the installed version is already current",
  },
  "ignore-version-constraints": {
    policy: "constraint",
    description: "Update even when the configured version constraint excludes the result",
  },
  "accept-warnings": {
    policy: "warning",
    description: "Apply the plan even when preflight reports unresolved warnings",
  },
  "ignore-release-age": {
    policy: "release age",
    description:
      "Take a release younger than the configured minimum release age, for this run only",
  },
} as const satisfies Record<string, { readonly policy: string; readonly description: string }>;

type OverrideFlagName = keyof typeof OVERRIDE_FLAG_DECLARATIONS;

/** Rendered flag spelling mapped to the policy phrase its help must name. */
export const NAMED_OVERRIDE_POLICIES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(OVERRIDE_FLAG_DECLARATIONS).map(([name, declaration]) => [
    `--${name}`,
    declaration.policy,
  ]),
);

const makeOverrideFlag = (name: OverrideFlagName) =>
  Flag.boolean(name).pipe(
    Flag.withDescription(OVERRIDE_FLAG_DECLARATIONS[name].description),
    Flag.withDefault(false),
  );

export const reinstallFlag = makeOverrideFlag("reinstall");

export const refreshFlag = makeOverrideFlag("refresh");

export const ignoreVersionConstraintsFlag = makeOverrideFlag("ignore-version-constraints");

/**
 * The one-shot minimum-release-age override. Every command whose outcome the
 * gate can change registers this exact definition, so the flag carries one
 * meaning across the surface and no other flag grants the bypass.
 */
export const ignoreReleaseAgeFlag = makeOverrideFlag("ignore-release-age");

export const acceptWarningsFlag = makeOverrideFlag("accept-warnings");

export const previewFlag = Flag.boolean("preview").pipe(
  Flag.withDescription("Display plan without applying"),
  Flag.withDefault(false),
);

export { agentFlag } from "./agent-flag.js";

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

import { makeVerbosityLayer, type VerbosityLevel } from "./verbosity.js";

export const TestFlagsLayer = (overrides?: {
  verbose?: boolean;
  debug?: boolean;
  quiet?: boolean;
  nonInteractive?: boolean;
  json?: boolean;
}) => {
  const level: VerbosityLevel = overrides?.quiet
    ? "quiet"
    : overrides?.debug
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
    Layer.succeed(
      jsonFlag,
      overrides?.json === undefined ? Option.none() : Option.some(overrides.json),
    ),
    Layer.succeed(quietFlag, overrides?.quiet ?? false),
    Layer.succeed(verboseFlag, overrides?.verbose ?? false),
    Layer.succeed(debugFlag, overrides?.debug ?? false),
  );
};

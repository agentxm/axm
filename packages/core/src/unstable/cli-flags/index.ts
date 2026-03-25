import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

// ---------------------------------------------------------------------------
// Global flag definitions (parsed by Effect CLI at the root command level)
// ---------------------------------------------------------------------------

export { isNonInteractive, nonInteractiveFlag } from "../utils/environment.js";
import { nonInteractiveFlag } from "../utils/environment.js";

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CliEnvironmentService {
  readonly verbose: boolean;
  readonly debug: boolean;
}

export class CliEnvironment extends ServiceMap.Service<CliEnvironment, CliEnvironmentService>()(
  "@axm.sh/cli/CliEnvironment",
) {}

export const makeCliEnvironmentLayer = (options?: {
  readonly envVerbose?: boolean | undefined;
  readonly envDebug?: boolean | undefined;
}) =>
  Layer.effect(
    CliEnvironment,
    Effect.gen(function* () {
      const debug = (yield* debugFlag) || (options?.envDebug ?? false);
      const verbose = (yield* verboseFlag) || (options?.envVerbose ?? false) || debug;

      return {
        verbose,
        debug,
      } satisfies CliEnvironmentService;
    }),
  );

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

export const CliEnvironmentTest = (
  overrides?: Partial<CliEnvironmentService> & { nonInteractive?: boolean },
) =>
  Layer.mergeAll(
    Layer.succeed(CliEnvironment, {
      verbose: overrides?.verbose ?? false,
      debug: overrides?.debug ?? false,
    }),
    Layer.succeed(
      nonInteractiveFlag,
      overrides?.nonInteractive === undefined
        ? Option.some(true)
        : Option.some(overrides.nonInteractive),
    ),
  );

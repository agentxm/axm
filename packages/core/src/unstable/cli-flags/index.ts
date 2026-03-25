import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

import { type CommandArgvService, readBooleanFlag } from "../cli-runtime/command-argv.js";
import { isInteractive } from "../utils/tty.js";

// ---------------------------------------------------------------------------
// Global flag definition (parsed by Effect CLI at the root command level)
// ---------------------------------------------------------------------------

export const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

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

export interface CliFlagsService {
  readonly isCI: boolean;
  readonly nonInteractive: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly verbose: boolean;
  readonly debug: boolean;
}

export class CliFlags extends ServiceMap.Service<CliFlags, CliFlagsService>()(
  "@axm.sh/cli/CliFlags",
) {}

export const makeCliFlagsLayer = (options?: {
  readonly ci?: boolean | undefined;
  readonly argv?: CommandArgvService | undefined;
  readonly envVerbose?: boolean | undefined;
  readonly envDebug?: boolean | undefined;
}) =>
  Layer.effect(
    CliFlags,
    Effect.gen(function* () {
      const nonInteractiveOpt = yield* nonInteractiveFlag;
      const isCI = options?.ci ?? false;
      const argv = options?.argv;

      const debug = (yield* debugFlag) || (options?.envDebug ?? false);
      const verbose = (yield* verboseFlag) || (options?.envVerbose ?? false) || debug;

      return {
        isCI,
        nonInteractive: Option.getOrElse(nonInteractiveOpt, () => isCI || !isInteractive()),
        yes: argv ? readBooleanFlag(argv, "yes") : false,
        force: argv ? readBooleanFlag(argv, "force") : false,
        preview: argv ? readBooleanFlag(argv, "preview") : false,
        verbose,
        debug,
      } satisfies CliFlagsService;
    }),
  );

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

export const CliFlagsTest = (overrides?: Partial<CliFlagsService>): Layer.Layer<CliFlags> =>
  Layer.succeed(CliFlags, {
    isCI: false,
    nonInteractive: true,
    yes: false,
    force: false,
    preview: false,
    verbose: false,
    debug: false,
    ...overrides,
  });

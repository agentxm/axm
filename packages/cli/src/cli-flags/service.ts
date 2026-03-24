import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";
import { CliEnvConfig } from "../config/index.js";
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
  readonly nonInteractive: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export class CliFlags extends ServiceMap.Service<CliFlags, CliFlagsService>()(
  "@axm.sh/cli/CliFlags",
) {}

// ---------------------------------------------------------------------------
// Layer factory — resolves nonInteractive from the global flag + env config,
// and accepts per-command yes/force/preview values (default false).
// ---------------------------------------------------------------------------

export const makeCliFlagsLayer = (perCommandFlags?: {
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly preview?: boolean;
}) =>
  Layer.effect(
    CliFlags,
    Effect.gen(function* () {
      const nonInteractiveOpt = yield* nonInteractiveFlag;
      const envConfig = yield* CliEnvConfig;
      return {
        nonInteractive: Option.getOrElse(
          nonInteractiveOpt,
          () => envConfig.ci === "true" || !isInteractive(),
        ),
        yes: perCommandFlags?.yes ?? false,
        force: perCommandFlags?.force ?? false,
        preview: perCommandFlags?.preview ?? false,
      };
    }),
  );

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

export const CliFlagsTest = (overrides?: Partial<CliFlagsService>): Layer.Layer<CliFlags> =>
  Layer.succeed(CliFlags, {
    nonInteractive: true,
    yes: false,
    force: false,
    preview: false,
    ...overrides,
  });

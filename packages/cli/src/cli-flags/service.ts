import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";
import { CliEnvConfig } from "../config/index.js";
import { isInteractive } from "../utils/tty.js";

// ---------------------------------------------------------------------------
// Global flag definitions (parsed by Effect CLI, yielded by CliFlagsLive)
// ---------------------------------------------------------------------------

export const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

export const yesFlag = GlobalFlag.setting("axm-yes")({
  flag: Flag.boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription("Auto-accept confirmation prompts"),
  ),
});

export const forceFlag = GlobalFlag.setting("axm-force")({
  flag: Flag.boolean("force").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Override constraints that would cause failure"),
  ),
});

export const previewFlag = GlobalFlag.setting("axm-preview")({
  flag: Flag.boolean("preview").pipe(Flag.withDescription("Display plan without applying")),
});

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
// Live layer — resolves global flags + env config into CliFlags
// ---------------------------------------------------------------------------

export const CliFlagsLive = Layer.effect(
  CliFlags,
  Effect.gen(function* () {
    const nonInteractiveOpt = yield* nonInteractiveFlag;
    const envConfig = yield* CliEnvConfig;
    return {
      nonInteractive: Option.getOrElse(
        nonInteractiveOpt,
        () => envConfig.ci === "true" || !isInteractive(),
      ),
      yes: yield* yesFlag,
      force: yield* forceFlag,
      preview: yield* previewFlag,
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

import * as ServiceMap from "effect/ServiceMap";
import * as Layer from "effect/Layer";
import { Flag, GlobalFlag } from "effect/unstable/cli";

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

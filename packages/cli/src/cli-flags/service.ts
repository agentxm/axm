import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliEnvConfig } from "../config/index.js";
import { isInteractive } from "../utils/tty.js";

export interface CliFlagsService {
  readonly nonInteractive: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export class CliFlags extends ServiceMap.Service<CliFlags, CliFlagsService>()(
  "@axm.sh/cli/CliFlags",
) {}

export interface CliFlagsInput {
  readonly nonInteractive: Option.Option<boolean>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const layer = (input: CliFlagsInput): Layer.Layer<CliFlags, never, CliEnvConfig> =>
  Layer.effect(
    CliFlags,
    Effect.gen(function* () {
      const envConfig = yield* CliEnvConfig;
      return {
        nonInteractive: Option.getOrElse(
          input.nonInteractive,
          () => envConfig.ci === "true" || !isInteractive(),
        ),
        yes: input.yes,
        force: input.force,
        preview: input.preview,
      };
    }),
  );

export const CliFlagsTest = (overrides?: Partial<CliFlagsService>): Layer.Layer<CliFlags> =>
  Layer.succeed(CliFlags, {
    nonInteractive: true,
    yes: false,
    force: false,
    preview: false,
    ...overrides,
  });

/**
 * Extract CliFlags input from a parsed CLI argument object.
 *
 * Global flags (yes, force, preview, non-interactive) are attached by the
 * active parser layer and available on every command argv via the index
 * signature. This helper reads them with proper typing so individual command
 * runners do not need casts.
 */
export const extractFlags = (argv: Record<string, unknown>): CliFlagsInput => ({
  nonInteractive: Option.fromUndefinedOr(argv["non-interactive"] as boolean | undefined),
  yes: (argv["yes"] as boolean | undefined) ?? false,
  force: (argv["force"] as boolean | undefined) ?? false,
  preview: (argv["preview"] as boolean | undefined) ?? false,
});

import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { isInteractive } from "../utils/tty.js";

export interface CliFlagsService {
  readonly nonInteractive: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export class CliFlags extends Context.Tag("@axm.sh/cli/CliFlags")<CliFlags, CliFlagsService>() {}

export interface CliFlagsInput {
  readonly nonInteractive: Option.Option<boolean>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const layer = (input: CliFlagsInput): Layer.Layer<CliFlags> =>
  Layer.succeed(CliFlags, {
    nonInteractive: Option.getOrElse(
      input.nonInteractive,
      () => process.env["CI"] === "true" || !isInteractive(),
    ),
    yes: input.yes,
    force: input.force,
    preview: input.preview,
  });

export const CliFlagsTest = (overrides?: Partial<CliFlagsService>): Layer.Layer<CliFlags> =>
  Layer.succeed(CliFlags, {
    nonInteractive: true,
    yes: false,
    force: false,
    preview: false,
    ...overrides,
  });

/**
 * Extract CliFlags input from a yargs argv object.
 *
 * Global flags (yes, force, preview, non-interactive) are defined in main.ts
 * and available on every command's argv via the index signature. This helper
 * reads them with proper typing so individual commands don't need casts.
 */
export const extractFlags = (argv: Record<string, unknown>): CliFlagsInput => ({
  nonInteractive: Option.fromNullable(argv["non-interactive"] as boolean | undefined),
  yes: (argv["yes"] as boolean | undefined) ?? false,
  force: (argv["force"] as boolean | undefined) ?? false,
  preview: (argv["preview"] as boolean | undefined) ?? false,
});

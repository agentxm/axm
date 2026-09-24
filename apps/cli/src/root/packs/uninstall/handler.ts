/**
 * `axm packs uninstall`.
 */

import * as Option from "effect/Option";

import { runUninstallCommand } from "../../shared/uninstall-command.js";

export interface UninstallPackHandlerArgs {
  /** Pack name, fully-qualified pack identity, or glob. */
  readonly name: string;
}

export const handleUninstallPack = (
  args: UninstallPackHandlerArgs,
  flags: { readonly preview: boolean },
) =>
  runUninstallCommand({
    command: "packs.uninstall",
    preview: flags.preview,
    request: { type: Option.some("pack"), selector: args.name },
    recoveryCommand: ["packs", "uninstall"],
    recoveryPositionals: [args.name],
  });

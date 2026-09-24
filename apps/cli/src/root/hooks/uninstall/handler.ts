/**
 * `axm hooks uninstall`.
 */

import * as Option from "effect/Option";

import { runUninstallCommand } from "../../shared/uninstall-command.js";

export interface UninstallHookHandlerArgs {
  readonly name: string;
}

export const handleUninstallHook = (
  args: UninstallHookHandlerArgs,
  flags: { readonly preview: boolean },
) =>
  runUninstallCommand({
    command: "hooks.uninstall",
    preview: flags.preview,
    request: { type: Option.some("hook"), selector: args.name },
    recoveryCommand: ["hooks", "uninstall"],
    recoveryPositionals: [args.name],
  });

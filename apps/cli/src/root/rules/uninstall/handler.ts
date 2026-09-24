/**
 * `axm rules uninstall`.
 */

import * as Option from "effect/Option";

import { runUninstallCommand } from "../../shared/uninstall-command.js";

export interface UninstallRuleHandlerArgs {
  readonly name: string;
}

export const handleUninstallRule = (
  args: UninstallRuleHandlerArgs,
  flags: { readonly preview: boolean },
) =>
  runUninstallCommand({
    command: "rules.uninstall",
    preview: flags.preview,
    request: { type: Option.some("rule"), selector: args.name },
    recoveryCommand: ["rules", "uninstall"],
    recoveryPositionals: [args.name],
  });

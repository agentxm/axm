/**
 * `axm subagents uninstall`.
 */

import * as Option from "effect/Option";

import { runUninstallCommand } from "../../shared/uninstall-command.js";

export interface UninstallSubagentHandlerArgs {
  /** Name, identifier, or glob of the subagent to uninstall. */
  readonly subagent: string;
}

export const handleUninstall = (
  args: UninstallSubagentHandlerArgs,
  flags: { readonly preview: boolean },
) =>
  runUninstallCommand({
    command: "subagents.uninstall",
    preview: flags.preview,
    liveName: "Uninstall subagent",
    request: {
      type: Option.some("subagent"),
      selector: args.subagent,
    },
    recoveryCommand: ["subagents", "uninstall"],
    recoveryPositionals: [args.subagent],
    suggestions: () => [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
    noOpMessage: () => "No subagents uninstalled.",
  });

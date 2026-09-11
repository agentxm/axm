/**
 * `axm skills uninstall`.
 *
 * The selector may be a name, a fully-qualified identifier, or a glob; a glob
 * that matched nothing is a no-op rather than a refusal, and only a literal
 * name can say which skill was already absent.
 */

import * as Option from "effect/Option";

import { runUninstallCommand } from "../../shared/uninstall-command.js";

export interface UninstallHandlerArgs {
  /** Name, identifier, or glob of the skill to uninstall. */
  readonly skill: string;
}

export const handleUninstall = (args: UninstallHandlerArgs, flags: { readonly preview: boolean }) =>
  runUninstallCommand({
    command: "skills.uninstall",
    preview: flags.preview,
    liveName: "Uninstall skill",
    request: {
      type: Option.some("skill"),
      selector: args.skill,
    },
    recoveryCommand: ["skills", "uninstall"],
    recoveryPositionals: [args.skill],
    suggestions: () => [{ description: "Inspect installed skills", cmd: "axm skills list" }],
    noOpMessage: ({ selector, alreadyAbsent }) =>
      alreadyAbsent && !selector.includes("*")
        ? `No skills uninstalled; ${selector} is not installed.`
        : "No skills uninstalled.",
  });

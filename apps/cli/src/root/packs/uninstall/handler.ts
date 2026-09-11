/**
 * `axm packs uninstall`.
 *
 * A preview that would remove nothing reports an empty result rather than a
 * no-op, because the pack graph itself is the subject and "nothing to remove"
 * is a fact about that graph.
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
    liveName: "Uninstall pack",
    request: { type: Option.some("pack"), selector: args.name },
    recoveryCommand: ["packs", "uninstall"],
    recoveryPositionals: [args.name],
    suggestions: () => [{ description: "Inspect installed packs", cmd: "axm packs list" }],
    noOpMessage: () => "No packs uninstalled.",
    previewEmptyResult: "No packs would be uninstalled.",
  });

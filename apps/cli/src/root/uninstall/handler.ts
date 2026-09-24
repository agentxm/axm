/**
 * `axm uninstall` — the root removal route.
 *
 * The registry FQN names the extension type, so this route reads it from the
 * request rather than fixing one; the wording it renders is the wording every
 * type's own command would have used.
 */

import * as Option from "effect/Option";

import { runUninstallCommand } from "../shared/uninstall-command.js";

export interface RootUninstallFlags {
  readonly preview: boolean;
}

export interface RootUninstallHandlerArgs extends RootUninstallFlags {
  readonly source: string;
}

export const handleUninstall = (args: RootUninstallHandlerArgs) =>
  runUninstallCommand({
    command: "uninstall",
    preview: args.preview,
    request: {
      type: Option.none(),
      selector: args.source,
    },
    recoveryCommand: ["uninstall"],
    recoveryPositionals: [args.source],
  });

/**
 * `axm uninstall` — the root removal route.
 *
 * The registry FQN names the extension type, so this route reads it from the
 * request rather than fixing one; the wording it renders is the wording every
 * type's own command would have used.
 */

import * as Option from "effect/Option";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { runUninstallCommand } from "../shared/uninstall-command.js";

export interface RootUninstallFlags {
  readonly preview: boolean;
}

export interface RootUninstallHandlerArgs extends RootUninstallFlags {
  readonly source: string;
}

/** What to inspect next, per type. */
export const uninstallSuggestions = (
  type: InstallableExtensionType,
): ReadonlyArray<SuggestedAction> => {
  switch (type) {
    case "skill":
      return [{ description: "Inspect installed skills", cmd: "axm skills list" }];
    case "mcp-server":
      return [{ description: "Inspect MCP servers", cmd: "axm mcps list" }];
    case "rule":
      return [{ description: "Inspect installed rules", cmd: "axm rules list" }];
    case "hook":
      return [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }];
    case "knowledge":
      return [{ description: "Inspect installed knowledge", cmd: "axm knowledge list" }];
    case "subagent":
      return [{ description: "Inspect installed subagents", cmd: "axm subagents list" }];
    case "pack":
      return [{ description: "Inspect installed packs", cmd: "axm packs list" }];
  }
};

/** What to say when a removal withdrew nothing, per type. */
export const uninstallNoOpMessage = (
  type: InstallableExtensionType,
  name: string,
  alreadyAbsent: boolean,
): string => {
  switch (type) {
    case "skill":
      return alreadyAbsent
        ? `No skills uninstalled; ${name} is not installed.`
        : "No skills uninstalled.";
    case "mcp-server":
      return "No MCP servers uninstalled.";
    case "rule":
      return "No rules uninstalled.";
    case "hook":
      return "No hooks packages uninstalled.";
    case "knowledge":
      return "No knowledge bundles uninstalled.";
    case "subagent":
      return "No subagents uninstalled.";
    case "pack":
      return "No packs uninstalled.";
  }
};

export const handleUninstall = (args: RootUninstallHandlerArgs) =>
  runUninstallCommand({
    command: "uninstall",
    preview: args.preview,
    // The root route accepts every type, so the live frame names the
    // operation generically until planning settles which type the FQN named.
    liveName: "Uninstall extension",
    request: {
      type: Option.none(),
      selector: args.source,
    },
    recoveryCommand: ["uninstall"],
    recoveryPositionals: [args.source],
    suggestions: uninstallSuggestions,
    // The registry FQN the person typed is not what a report calls the
    // extension: the settled removal names the same subject a typed route
    // would have named.
    noOpMessage: ({ type, selector, alreadyAbsent }) =>
      uninstallNoOpMessage(type, selector, alreadyAbsent),
  });

import * as Option from "effect/Option";

import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";

import { runCreateExtensionCommand } from "../../shared/create-extension-command.js";

export interface SubagentsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly preview: boolean;
}

export const handleSubagentsNew = (args: SubagentsNewHandlerArgs) =>
  runCreateExtensionCommand({
    command: "subagents.new",
    preview: args.preview,
    request: { type: "subagent", name: args.name, owner: args.owner },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to fill in instructions` },
    ],
  });

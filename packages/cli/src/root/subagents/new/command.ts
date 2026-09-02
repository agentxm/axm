import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { previewFlag, yesFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleSubagentsNew } from "./handler.js";

const newConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the subagent (without owner)"),
  ),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Agent IDs to target (can be repeated)"),
    Flag.atLeast(1),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the subagent without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, agent, yes, preview }) =>
  handleSubagentsNew({
    name: decodeExtensionNameSync(name),
    owner,
    agents: Option.map(agent, (value) => [...value]),
    yes,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("subagents new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new subagent in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm subagents new my-subagent", description: "Scaffold a new subagent" },
    {
      command: "axm subagents new my-subagent --owner @acme",
      description: "Create under a specific owner",
    },
  ]),
);

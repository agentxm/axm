import { Argument, Command, Flag } from "effect/unstable/cli";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
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
  preview: previewCapabilityFlag("Show what files would be created without creating them"),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, preview }) =>
  handleSubagentsNew({
    name: decodeExtensionNameSync(name),
    owner,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("subagents new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Create a new subagent in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm subagents new my-subagent", description: "Scaffold a new subagent" },
    {
      command: "axm subagents new my-subagent --owner @acme",
      description: "Create under a specific owner",
    },
  ]),
);

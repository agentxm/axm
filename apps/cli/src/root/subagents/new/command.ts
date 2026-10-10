import { creationOwnerFlag } from "../../../cli-flags/owner-handle.js";
import { withParameterDescription } from "../../../cli-parameters.js";
import { descriptionFlag } from "../../../cli-flags/index.js";
import { Argument, Command } from "effect/cli";
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
  name: Argument.String("name").pipe(
    withParameterDescription("Name of the subagent to create, without owner"),
  ),
  owner: creationOwnerFlag,
  description: descriptionFlag,
  preview: previewCapabilityFlag(),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, description, preview }) =>
  handleSubagentsNew({
    name: decodeExtensionNameSync(name),
    owner,
    description,
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

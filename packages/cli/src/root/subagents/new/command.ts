import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { decodeExtensionNameSync } from "@axm.sh/core/unstable/extensions";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { TOOL_ACCESS_LEVELS } from "@axm.sh/core/unstable/subagents";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleSubagentsNew } from "./handler.js";

const newConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the subagent (without owner)"),
  ),
  profile: Flag.string("profile").pipe(
    Flag.withDescription("Override the workspace profile (e.g., @acme)"),
    Flag.optional,
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Agent IDs to target (can be repeated)"),
    Flag.atLeast(1),
    Flag.optional,
  ),
  model: Flag.choice("model", ["fast", "default", "powerful", "inherit"]).pipe(
    Flag.withDescription("Model tier for the subagent"),
    Flag.optional,
  ),
  toolAccess: Flag.choice("tool-access", TOOL_ACCESS_LEVELS).pipe(
    Flag.withDescription("Tool access level for the subagent"),
    Flag.optional,
  ),
  background: Flag.boolean("background").pipe(
    Flag.withDescription("Run the subagent in the background"),
    Flag.withDefault(false),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the subagent without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Overwrite if a subagent with this name already exists"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, profile, agent, model, toolAccess, background, yes, force, preview }) =>
    handleSubagentsNew({
      name: decodeExtensionNameSync(name),
      profile,
      agents: Option.map(agent, (value) => [...value]),
      model,
      toolAccess,
      background,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("subagents new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new subagent"),
  Command.withExamples([
    { command: "axm subagents new my-subagent", description: "Scaffold a new subagent" },
    {
      command: "axm subagents new my-subagent --profile @acme",
      description: "Create under a specific owner",
    },
    {
      command: "axm subagents new my-subagent --model powerful --tool-access readonly",
      description: "Create with specific model and tool access",
    },
  ]),
);

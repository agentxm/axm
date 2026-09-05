import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag, ignoreVersionConstraintsFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { updateNameFilterFlag } from "../../shared/update-targets.js";
import { handleUpdate } from "./handler.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Filter to subagents from a specific source (owner/repo, path, or URL)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update subagents in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific subagents by name or glob pattern"),
  ),
  force: ignoreVersionConstraintsFlag,
  preview: previewCapabilityFlag("Show available updates without applying them"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, force, preview, ignoreReleaseAge }) =>
    handleUpdate({
      source,
      subagents: name,
      force,
      preview,
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("subagents update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Update installed subagents to latest versions"),
  Command.withExamples([
    {
      command: "axm subagents update",
      description: "Update all subagents to their latest versions",
    },
    {
      command: "axm subagents update --name researcher",
      description: "Update a specific subagent",
    },
    {
      command: "axm subagents update owner/repo",
      description: "Update only subagents from a specific source",
    },
    {
      command: "axm subagents update --preview",
      description: "Preview available updates",
    },
  ]),
);

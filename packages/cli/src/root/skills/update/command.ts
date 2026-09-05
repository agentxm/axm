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
    Argument.withDescription("Filter to skills from a specific source (owner/repo, path, or URL)"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update skills in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific skills by name or glob pattern"),
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
      skills: name,
      force,
      preview,
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("skills update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Update installed skills to latest versions"),
  Command.withExamples([
    { command: "axm skills update", description: "Update all skills to their latest versions" },
    {
      command: "axm skills update --name code-review",
      description: "Update a specific skill",
    },
    {
      command: "axm skills update owner/repo",
      description: "Update only skills from a specific source",
    },
    {
      command: "axm skills update --preview",
      description: "Preview available updates",
    },
  ]),
);

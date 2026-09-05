import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  ignoreReleaseAgeFlag,
  ignoreVersionConstraintsFlag,
  previewFlag,
  yesFlag,
} from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
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
  yes: yesFlag.pipe(
    Flag.withDescription(
      "Pre-approve the update when it carries a risk that would otherwise prompt",
    ),
  ),
  force: ignoreVersionConstraintsFlag,
  preview: previewFlag.pipe(Flag.withDescription("Show available updates without applying them")),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, yes, force, preview, ignoreReleaseAge }) =>
    handleUpdate({
      source,
      skills: name,
      yes,
      force,
      preview,
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("skills update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
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

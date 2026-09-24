/**
 * `axm skills update` — `axm update` narrowed to skills. The route parses
 * its selectors and hands them to the same configured sweep the root spelling
 * runs; nothing about which entries advance, or how, is decided here.
 */

import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";

import { ignoreReleaseAgeFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { updateNameFilterFlag } from "../../shared/update-targets.js";
import { handleWorkspaceUpdate } from "../../update/workspace-update-handler.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";

const COMMAND = "skills.update";
const PLAN_NAME = "Update skills";
const PLAN_DESCRIPTION = "Update configured skills";

const updateConfig = {
  source: Argument.String("source").pipe(
    Argument.withDescription(
      "Filter to skills matching a name or source (owner/repo, path, or URL)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update skills in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific skills by name or glob pattern"),
  ),
  preview: previewCapabilityFlag("Show available updates without applying them"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, preview, ignoreReleaseAge }) =>
    handleWorkspaceUpdate({
      command: COMMAND,
      type: Option.some("skill"),
      planName: PLAN_NAME,
      planDescription: Option.some(PLAN_DESCRIPTION),
      flags: { preview },
      selector: {
        resourceType: "skill",
        source,
        nameFilters: name,
      },
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("skills update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Update configured skills to the newest versions their sources offer"),
  Command.withExamples([
    {
      command: "axm skills update",
      description: "Update every configured skill",
    },
    {
      command: "axm skills update --name code-review",
      description: "Update one skill by name",
    },
    {
      command: "axm skills update owner/repo",
      description: "Update only skills from one source",
    },
    {
      command: "axm skills update --preview",
      description: "Preview available updates",
    },
  ]),
);

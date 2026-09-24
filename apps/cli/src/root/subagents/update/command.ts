/**
 * `axm subagents update` — `axm update` narrowed to subagents. The route parses
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

const COMMAND = "subagents.update";
const PLAN_NAME = "Update subagents";
const PLAN_DESCRIPTION = "Update configured subagents";

const updateConfig = {
  source: Argument.String("source").pipe(
    Argument.withDescription(
      "Filter to subagents matching a name or source (owner/repo, path, or URL)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update subagents in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific subagents by name or glob pattern"),
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
      type: Option.some("subagent"),
      planName: PLAN_NAME,
      planDescription: Option.some(PLAN_DESCRIPTION),
      flags: { preview },
      selector: {
        resourceType: "subagent",
        source,
        nameFilters: name,
      },
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("subagents update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Update configured subagents to the newest versions their sources offer"),
  Command.withExamples([
    {
      command: "axm subagents update",
      description: "Update every configured subagent",
    },
    {
      command: "axm subagents update --name researcher",
      description: "Update one subagent by name",
    },
    {
      command: "axm subagents update owner/repo",
      description: "Update only subagents from one source",
    },
    {
      command: "axm subagents update --preview",
      description: "Preview available updates",
    },
  ]),
);

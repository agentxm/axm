import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag, previewFlag, refreshFlag, yesFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { handleUpdate } from "./handler.js";

const updateConfig = {
  source: Argument.string("extension[@version]").pipe(
    Argument.withDescription("Registry FQN (@owner/<plural-type>/<name>[@version])"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(
    Flag.withDescription(
      "Pre-approve the update when it carries a risk that would otherwise prompt",
    ),
  ),
  force: refreshFlag,
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be updated without making changes"),
  ),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, yes, force, preview, ignoreReleaseAge }) =>
    handleUpdate({ source, yes, force, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update extensions to newer versions"),
  Command.withExamples([
    {
      command: "axm update",
      description: "Update all configured extensions in the current workspace",
    },
    {
      command: "axm update @acme/skills/code-review",
      description: "Update a skill by fully qualified registry name",
    },
    {
      command: "axm update @acme/hooks/session-audit@^1.2.0",
      description: "Update a hook with a version constraint",
    },
    {
      command: "axm update @acme/skills/code-review --ignore-release-age",
      description: "Review and bypass minimum release age for one targeted update",
    },
    {
      command: "axm update --preview",
      description: "Preview updates without applying them",
    },
  ]),
);

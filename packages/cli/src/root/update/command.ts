import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, refreshFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleUpdate } from "./handler.js";

const updateConfig = {
  source: Argument.string("extension[@version]").pipe(
    Argument.withDescription("Registry FQN (@owner/<plural-type>/<name>[@version])"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the update plan")),
  force: refreshFlag,
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be updated without making changes"),
  ),
  ignoreReleaseAge: Flag.boolean("ignore-release-age").pipe(
    Flag.withDescription("Allow Registry releases newer than minimumReleaseAge for this update"),
    Flag.withDefault(false),
  ),
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, yes, force, preview, ignoreReleaseAge }) =>
    handleUpdate({ source, yes, force, preview, ignoreReleaseAge }).pipe(
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

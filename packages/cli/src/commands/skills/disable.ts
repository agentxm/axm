import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleDisable } from "../../cli-commands/skills/disable/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const disableCommand = Command.make(
  "disable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to disable")),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, scope, yes, force, preview }) =>
    withRuntime(handleDisable({ name }), {
      command: "skills disable",
      workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
      flags: { yes, force, preview },
    }),
).pipe(Command.withDescription("Disable a skill without uninstalling it"));

import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleEnable } from "../../cli-commands/skills/enable/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const enableCommand = Command.make(
  "enable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
  },
  ({ name, scope }) =>
    withCommandRuntime(handleEnable({ name }), {
      command: "skills enable",
      workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
    }),
).pipe(Command.withDescription("Enable a previously disabled skill"));

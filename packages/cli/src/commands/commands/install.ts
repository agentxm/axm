import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleInstallCommand } from "../../cli-commands/commands/install/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("Registry command reference (@profile/commands/name or bare name)"),
    ),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ source, scope, yes, force, preview }) =>
    withRuntime(handleInstallCommand({ source, scope: resolveWorkspaceScope(scope) }), {
      command: "commands install",
      workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
      flags: { yes, force, preview },
    }),
).pipe(
  Command.withDescription("Install a command from a registry"),
  Command.withExamples([
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Install a command from the registry",
    },
    {
      command: "axm commands install my-cmd",
      description: "Install using the default profile",
    },
  ]),
);

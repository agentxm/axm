import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleUnpack } from "../../cli-commands/packs/unpack/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const unpackCommand = Command.make(
  "unpack",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Pack name to unpack")),
    strictAgentSync: Flag.boolean("strict-agent-sync").pipe(
      Flag.withDescription("Fail when MCP agent sync has strict-policy failures"),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, strictAgentSync, yes, force, preview }) =>
    withCommandRuntime(handleUnpack({ name, strictAgentSync }), {
      command: "packs unpack",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
      flags: { yes, force, preview },
    }),
).pipe(
  Command.withDescription("Eject pack into individual entries"),
  Command.withExamples([
    {
      command: "axm packs unpack @acme/frontend-tools",
      description: "Eject pack contents into settings",
    },
    {
      command: "axm packs unpack @acme/frontend-tools --preview",
      description: "See what would change in settings",
    },
  ]),
);

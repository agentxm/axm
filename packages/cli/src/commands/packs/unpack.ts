import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUnpack } from "../../cli-commands/packs/unpack/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

const unpackConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Pack name to unpack")),
  strictAgentSync: Flag.boolean("strict-agent-sync").pipe(
    Flag.withDescription("Fail when MCP agent sync has strict-policy failures"),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const unpackCommand = Command.make(
  "unpack",
  unpackConfig,
  ({ name, strictAgentSync, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handleUnpack({ name, strictAgentSync, yes, force, preview }),
      ),
      { command: "packs unpack" },
    ),
).pipe(
  withArgvTracking(unpackConfig),
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

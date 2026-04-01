import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRegistryRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUnpack } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

const unpackConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Pack name to unpack")),
  strictAgentSync: Flag.boolean("strict-agent-sync").pipe(
    Flag.withDescription("Fail when MCP agent sync has strict-policy failures"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Eject without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Eject even if it would overwrite existing individual entries"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would change in settings without modifying them"),
  ),
} as const;

export const unpackCommand = Command.make(
  "unpack",
  unpackConfig,
  ({ name, strictAgentSync, yes, force, preview }) =>
    handleUnpack({ name, strictAgentSync, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRegistryRuntime({ command: "packs unpack" }),
    ),
).pipe(
  withArgvTracking(unpackConfig),
  Command.withDescription("Eject pack into individual entries"),
  Command.withExamples([
    {
      command: "axm packs unpack @acme/frontend-tools",
      description: "Stop using a pack and manage extensions individually",
    },
    {
      command: "axm packs unpack @acme/frontend-tools --preview",
      description: "See what settings would change first",
    },
    {
      command: "",
      description: "See also: packs install, packs uninstall",
    },
  ]),
);

import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUnpack } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const unpackConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Extension pack name to unpack")),
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
    handleUnpack({
      name,
      strictAgentSync: Option.liftPredicate(strictAgentSync, Boolean),
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("packs unpack")),
).pipe(
  withArgvTracking(unpackConfig),
  Command.withDescription("Eject extension pack into individual entries"),
  Command.withExamples([
    {
      command: "axm packs unpack @acme/frontend-tools",
      description: "Stop using an extension pack and manage extensions individually",
    },
    {
      command: "axm packs unpack @acme/frontend-tools --preview",
      description: "See what settings would change first",
    },
  ]),
);

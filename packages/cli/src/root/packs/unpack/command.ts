import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { handleUnpack } from "./handler.js";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const unpackConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Pack name to unpack")),
  scope: scopeFlag.pipe(Flag.withDescription("Unpack project (default) or user-level pack state")),
  yes: yesFlag.pipe(Flag.withDescription("Eject without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would change in settings without modifying them"),
  ),
} as const;

export const unpackCommand = Command.make("unpack", unpackConfig, ({ name, scope, yes, preview }) =>
  handleUnpack({
    name,
    yes,
    preview,
  }).pipe(withWorkspace(scope), withRuntime("packs unpack")),
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
  ]),
);

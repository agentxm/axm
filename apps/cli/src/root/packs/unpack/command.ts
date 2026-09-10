import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { handleUnpack } from "./handler.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const unpackConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Pack name to unpack")),
  scope: scopeFlag.pipe(Flag.withDescription("Unpack project (default) or user-level pack state")),
  preview: previewCapabilityFlag("Show what would change in settings without modifying them"),
} as const;

export const unpackCommand = Command.make("unpack", unpackConfig, ({ name, scope, preview }) =>
  handleUnpack({ name, preview }).pipe(withWorkspace(scope), withRuntime("packs unpack")),
).pipe(
  withArgvTracking(unpackConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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

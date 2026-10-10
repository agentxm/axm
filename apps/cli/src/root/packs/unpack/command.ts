import { withParameterDescription } from "../../../cli-parameters.js";
import { Argument, Command } from "effect/cli";

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
  name: Argument.String("name").pipe(withParameterDescription("Name of the pack to unpack")),
  scope: scopeFlag,
  preview: previewCapabilityFlag(),
} as const;

export const unpackCommand = Command.make("unpack", unpackConfig, ({ name, scope, preview }) =>
  handleUnpack({ name, preview }).pipe(withWorkspace(scope), withRuntime("packs unpack")),
).pipe(
  withArgvTracking(unpackConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Unpack a configured pack into individually configured extensions"),
  Command.withExamples([
    {
      command: "axm packs unpack frontend-tools",
      description: "Stop using a pack and manage extensions individually",
    },
    {
      command: "axm packs unpack frontend-tools --preview",
      description: "See what settings would change first",
    },
  ]),
);

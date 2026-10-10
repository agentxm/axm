import { LearnMore, formatLearnMore } from "../../formatter.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { Argument, Command, Flag } from "effect/cli";
import { selfUpdateLayer, withRuntime } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

import { handleUpgrade } from "./handler.js";

const upgradeConfig = {
  version: Argument.String("version").pipe(
    withParameterDescription("Exact stable version; omit to use the latest production release"),
    Argument.optional,
  ),
  reinstall: Flag.Boolean("reinstall").pipe(
    withParameterDescription("Reinstall an equal version; never permits a downgrade"),
    withParameterDefault(false),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const upgradeCommand = Command.make(
  "upgrade",
  upgradeConfig,
  ({ preview, reinstall, version }) =>
    Effect.provide(
      handleUpgrade({
        reinstall,
        preview,
        ...(version._tag === "None" ? {} : { requestedVersion: version.value }),
      }),
      selfUpdateLayer,
    ).pipe(withRuntime("upgrade")),
).pipe(
  withArgvTracking(upgradeConfig),
  withCommandCapabilities(previewableCapabilities("installation")),
  Command.annotate(LearnMore, formatLearnMore([["axm help upgrade", "Read the upgrade guide"]])),
  Command.withDescription("Update axm to the promoted stable or an exact version"),
  Command.withExamples([
    { command: "axm upgrade", description: "Download and install the latest version" },
    {
      command: "axm upgrade 1.2.3",
      description: "Install an exact stable version without release discovery",
    },
    {
      command: "axm upgrade --reinstall",
      description: "Reinstall an equal version without permitting a downgrade",
    },
    {
      command: "axm upgrade --preview",
      description: "Show the detected installer and the command it would run, changing nothing",
    },
  ]),
);

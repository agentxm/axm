import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { InstallMethodLive } from "../../install-method/install-method.js";
import { InstallMetaLive } from "../../install-meta/install-meta.js";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withRuntime } from "../../runtime.js";
import { UpdateCheckLive } from "../../update-check/update-check.js";

import { handleUpgrade } from "./handler.js";
import { SubprocessLive } from "./subprocess.js";

const upgradeLayer = Layer.mergeAll(
  InstallMethodLive,
  InstallMetaLive,
  SubprocessLive,
  UpdateCheckLive,
);

const upgradeConfig = {
  version: Argument.string("version").pipe(
    Argument.withDescription("Exact stable version; omit to use the promoted stable channel"),
    Argument.optional,
  ),
  reinstall: Flag.boolean("reinstall").pipe(
    Flag.withDescription("Reinstall an equal version; never permits a downgrade"),
    Flag.withDefault(false),
  ),
} as const;

export const upgradeCommand = Command.make("upgrade", upgradeConfig, ({ reinstall, version }) =>
  Effect.provide(
    handleUpgrade({
      reinstall,
      ...(version._tag === "None" ? {} : { requestedVersion: version.value }),
    }),
    upgradeLayer,
  ).pipe(withRuntime("upgrade")),
).pipe(
  withArgvTracking(upgradeConfig),
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
  ]),
);

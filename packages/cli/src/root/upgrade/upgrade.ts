import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { InstallMethodLive } from "@agentxm/client-core/unstable/install-method";
import { InstallMetaLive } from "@agentxm/client-core/unstable/install-meta";
import { Command, Flag } from "effect/unstable/cli";
import { withRuntime } from "../../runtime.js";

import { handleUpgrade } from "./handler.js";
import { SubprocessLive } from "./subprocess.js";

const upgradeLayer = Layer.mergeAll(InstallMethodLive, InstallMetaLive, SubprocessLive);

const upgradeConfig = {
  reinstall: Flag.boolean("reinstall").pipe(
    Flag.withDescription("Reinstall an equal version; never permits a downgrade"),
    Flag.withDefault(false),
  ),
} as const;

export const upgradeCommand = Command.make("upgrade", upgradeConfig, ({ reinstall }) =>
  Effect.provide(handleUpgrade({ reinstall }), upgradeLayer).pipe(withRuntime("upgrade")),
).pipe(
  withArgvTracking(upgradeConfig),
  Command.withDescription("Update axm to the latest version"),
  Command.withExamples([
    { command: "axm upgrade", description: "Download and install the latest version" },
    {
      command: "axm upgrade --reinstall",
      description: "Reinstall an equal version without permitting a downgrade",
    },
  ]),
);

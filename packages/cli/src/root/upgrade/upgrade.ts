/**
 * Upgrade command definition for `axm upgrade`.
 *
 * Downloads and installs the latest CLI version for script installs,
 * or prints delegation instructions for other install methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { forceFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { InstallMethodLive } from "@axm.sh/core/unstable/install-method";
import { InstallMetaLive } from "@axm.sh/core/unstable/install-meta";
import { Command, Flag } from "effect/unstable/cli";

import { withRegistryRuntime } from "../../runtime.js";
import { handleUpgrade } from "./handler.js";

// -----------------------------------------------------------------------------
// Layer
// -----------------------------------------------------------------------------

const upgradeLayer = Layer.mergeAll(InstallMethodLive, InstallMetaLive);

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const upgradeConfig = {
  force: forceFlag.pipe(
    Flag.withDescription("Re-download even if already up to date (script installs only)"),
  ),
} as const;

export const upgradeCommand = Command.make("upgrade", upgradeConfig, ({ force }) =>
  Effect.provide(handleUpgrade({ force }), upgradeLayer).pipe(
    withRegistryRuntime({ command: "upgrade" }),
  ),
).pipe(
  withArgvTracking(upgradeConfig),
  Command.withDescription("Update axm to the latest version"),
  Command.withExamples([
    { command: "axm upgrade", description: "Download and install the latest version" },
    { command: "axm upgrade --force", description: "Re-download even if already up to date" },
  ]),
);

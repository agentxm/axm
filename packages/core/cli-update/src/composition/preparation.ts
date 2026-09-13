import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  InstallationInspection,
  InstallerInstructions,
  UpgradeExecutionObserver,
} from "@agentxm/cli-maintenance/self-update/application";
import { CliReleaseCatalogLive } from "@agentxm/cli-maintenance/self-update/composition";
import { InstallMethod } from "../install-method/install-method.js";
import { Subprocess } from "../subprocess/subprocess.js";
import { makeInstallationInspection } from "../adapters/preparation/index.js";
import { makeInstallerInstructions } from "../adapters/installer-instructions.js";
import { makeCommandRunner } from "../adapters/subprocess/command-evidence.js";

const InstallationInspectionLive = Layer.effect(
  InstallationInspection,
  Effect.gen(function* () {
    const run = makeCommandRunner(yield* Subprocess, (yield* UpgradeExecutionObserver).command);
    return makeInstallationInspection(yield* InstallMethod, run);
  }),
);

/** Select host inspection and release acquisition for the owned preparation contracts. */
export const UpgradePreparationLive = Layer.mergeAll(
  Layer.succeed(InstallerInstructions, makeInstallerInstructions(process.platform)),
  InstallationInspectionLive,
  CliReleaseCatalogLive,
);

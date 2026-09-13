import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  InstallationInspection,
  InstallerInstructions,
  UpgradeExecutionObserver,
} from "../../application/index.js";
import { CliReleaseCatalogLive } from "../index.js";
import { InstallMethod } from "../../adapters/native/install-method/install-method.js";
import { Subprocess } from "../../adapters/native/subprocess/subprocess.js";
import { makeInstallationInspection } from "../../adapters/native/preparation/index.js";
import { makeInstallerInstructions } from "../../adapters/native/installer-instructions.js";
import { makeCommandRunner } from "../../adapters/native/subprocess/command-evidence.js";

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

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import {
  CliReleaseCatalog,
  InstallationInspection,
  InstallerInstructions,
} from "@agentxm/cli-maintenance/self-update/application";
import { CliReleaseCatalogLive } from "@agentxm/cli-maintenance/self-update/composition";
import { InstallMethod } from "../install-method/install-method.js";
import { Subprocess } from "../subprocess/subprocess.js";
import {
  makeInstallationInspection,
  observeReleaseCatalog,
} from "../adapters/preparation/index.js";
import { makeInstallerInstructions } from "../adapters/installer-instructions.js";
import { makeCommandRunner } from "../adapters/subprocess/command-evidence.js";

const InstallationInspectionLive = Layer.effect(
  InstallationInspection,
  Effect.gen(function* () {
    const run = makeCommandRunner(yield* Subprocess, yield* Ref.make(0), "ownership-command");
    return makeInstallationInspection(yield* InstallMethod, run);
  }),
);

const ObservedReleaseCatalogLive = Layer.effect(
  CliReleaseCatalog,
  Effect.map(CliReleaseCatalog, observeReleaseCatalog),
);

/** Select host inspection and CLI progress around the owned preparation contracts. */
export const UpgradePreparationLive = Layer.mergeAll(
  Layer.succeed(InstallerInstructions, makeInstallerInstructions(process.platform)),
  InstallationInspectionLive,
  Layer.provide(ObservedReleaseCatalogLive, CliReleaseCatalogLive),
);

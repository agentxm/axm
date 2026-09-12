import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  CliReleaseCatalog,
  InstallationInspection,
} from "@agentxm/cli-maintenance/self-update/application";
import { CliReleaseCatalogLive } from "@agentxm/cli-maintenance/self-update/composition";
import { InstallMethod } from "../install-method/install-method.js";
import { Subprocess } from "../subprocess/subprocess.js";
import {
  makeInstallationInspection,
  observeReleaseCatalog,
} from "../adapters/preparation/index.js";

const InstallationInspectionLive = Layer.effect(
  InstallationInspection,
  Effect.gen(function* () {
    return makeInstallationInspection(yield* InstallMethod, yield* Subprocess);
  }),
);

const ObservedReleaseCatalogLive = Layer.effect(
  CliReleaseCatalog,
  Effect.map(CliReleaseCatalog, observeReleaseCatalog),
);

/** Select host inspection and CLI progress around the owned preparation contracts. */
export const UpgradePreparationLive = Layer.mergeAll(
  InstallationInspectionLive,
  Layer.provide(ObservedReleaseCatalogLive, CliReleaseCatalogLive),
);

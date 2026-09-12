import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { InstallMethodType } from "../domain/index.js";
import type { CommandRecord } from "./evidence.js";
import type { UpgradeFailed } from "./errors.js";

export interface InspectedInstallation {
  readonly method: InstallMethodType;
  readonly commands: ReadonlyArray<CommandRecord>;
}

/** Observed host facts and ownership; admission remains application policy. */
export interface InstallationInspectionService {
  readonly platform: string;
  readonly architecture: string;
  readonly inspect: (
    workingDirectory: string,
  ) => Effect.Effect<InspectedInstallation, UpgradeFailed>;
}

export class InstallationInspection extends Context.Service<
  InstallationInspection,
  InstallationInspectionService
>()("@agentxm/cli-maintenance/self-update/InstallationInspection") {}

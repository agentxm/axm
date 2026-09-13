import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type { Script } from "../domain/index.js";
import type { CommandRecord } from "./evidence.js";
import type { InspectedInstallation } from "./installation.js";
import type { SelectedRelease } from "./releases.js";
import type {
  PackageManagedInstallation,
  RegistryManagedInstallation,
} from "./package-installer.js";

export type UpgradeExecutionStage =
  | { readonly kind: "availability"; readonly method: RegistryManagedInstallation }
  | {
      readonly kind: "mutation";
      readonly method: PackageManagedInstallation | Script;
      readonly targetVersion: string;
    };

export interface UpgradeExecutionObserverService {
  readonly during: <A, E, R>(
    stage: UpgradeExecutionStage,
    execution: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  readonly installation: <E, R>(
    inspection: Effect.Effect<InspectedInstallation, E, R>,
  ) => Effect.Effect<InspectedInstallation, E, R>;
  readonly release: <E, R>(
    requestedVersion: string | undefined,
    selection: Effect.Effect<SelectedRelease, E, R>,
  ) => Effect.Effect<SelectedRelease, E, R>;
  readonly command: <E, R>(
    command: Pick<CommandRecord, "purpose" | "executable" | "args">,
    execution: Effect.Effect<CommandRecord, E, R>,
  ) => Effect.Effect<CommandRecord, E, R>;
  readonly download: <A, E, R>(
    binaryName: string,
    read: (
      report: (received: number, total: number | undefined) => Effect.Effect<void>,
    ) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

/** Delivery may observe application stages; running the application requires no terminal. */
export const UpgradeExecutionObserver = Context.Reference<UpgradeExecutionObserverService>(
  "@agentxm/cli-maintenance/self-update/UpgradeExecutionObserver",
  {
    defaultValue: () => ({
      during: (_stage, execution) => execution,
      installation: (inspection) => inspection,
      release: (_requestedVersion, selection) => selection,
      command: (_command, execution) => execution,
      download: (_binaryName, read) => read(() => Effect.void),
    }),
  },
);

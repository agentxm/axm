import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type {
  PackageManagedInstallation,
  RegistryManagedInstallation,
} from "./package-installer.js";

export type UpgradeExecutionStage =
  | { readonly kind: "availability"; readonly method: RegistryManagedInstallation }
  | {
      readonly kind: "mutation";
      readonly method: PackageManagedInstallation;
      readonly targetVersion: string;
    };

export interface UpgradeExecutionObserverService {
  readonly during: <A, E, R>(
    stage: UpgradeExecutionStage,
    execution: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

/** Delivery may observe application stages; running the application requires no terminal. */
export const UpgradeExecutionObserver = Context.Reference<UpgradeExecutionObserverService>(
  "@agentxm/cli-maintenance/self-update/UpgradeExecutionObserver",
  { defaultValue: () => ({ during: (_stage, execution) => execution }) },
);

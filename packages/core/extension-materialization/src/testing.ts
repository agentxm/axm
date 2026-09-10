/**
 * In-memory materialization doubles for feature tests: a manager whose
 * surfaces are recorded rather than written, a retention policy that never
 * retains, and a structural serialization of a recipe's typed failure into the
 * plan-step vocabulary.
 *
 * These are deliberately behavioural, not mocks of a shape: a test asserts on
 * what the recorder observed, so a contract change that stops calling a
 * surface fails the test rather than passing silently.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { StepFailure } from "@agentxm/workspace-operations";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionTarget } from "@agentxm/workspace-state";
import type {
  ExtensionManager,
  ManagerRequirements,
  MaterializationFacts,
} from "./manager-contract.js";
import { NO_MATERIALIZATION_OBSERVATION } from "./manager-contract.js";
import type { CallerStepFailure, UninstallRetentionPolicy } from "./extensions/operations.js";
import { targetFromRef } from "./extensions/operations.js";

/** The manager surfaces one recipe touched, in the order it touched them. */
export type RecordedManagerSurface =
  | "materializeInstall"
  | "materializeUninstall"
  | "materializeDeactivate"
  | "upsertSettingsEntry"
  | "removeSettingsEntry"
  | "upsertLockfileEntry"
  | "removeLockfileEntry"
  | "listMaterializable"
  | "projectionPlans";

/** What an in-memory manager observed while a recipe ran against it. */
export interface RecordedManager<TRef extends ExtensionRef> {
  readonly manager: ExtensionManager<TRef, MaterializationFacts, ManagerRequirements>;
  /** Every surface the recipe touched, in call order. */
  readonly surfaces: ReadonlyArray<RecordedManagerSurface>;
  /** Targets currently declared in the recorder's settings. */
  readonly configured: ReadonlySet<string>;
  /** Targets currently observable as installed. */
  readonly installed: ReadonlySet<string>;
}

/**
 * A materialization that observed nothing and acquired nothing. It satisfies
 * every per-type facts shape, so a feature test that never asserts on content
 * identity uses one value for any manager.
 */
export const NO_MATERIALIZATION_FACTS = {
  observation: NO_MATERIALIZATION_OBSERVATION,
  treeIntegrity: Option.none(),
  sourceHash: Option.none(),
  acquired: Option.none(),
  removal: Option.none(),
} as const;

const NO_FACTS: MaterializationFacts = NO_MATERIALIZATION_FACTS;

/**
 * A manager whose authoritative surfaces are in-memory sets. `materializable`
 * is what `listMaterializable` answers; anything installed through the
 * recorder becomes both configured and observable.
 */
export const makeRecordedManager = <TRef extends ExtensionRef>(args: {
  readonly type: TRef["type"];
  readonly materializable: ReadonlyArray<TRef>;
  /** Targets already installed and declared before the recipe runs. */
  readonly installed?: ReadonlyArray<string>;
}): RecordedManager<TRef> => {
  const surfaces: Array<RecordedManagerSurface> = [];
  const configured = new Set<string>(args.installed ?? []);
  const installed = new Set<string>(args.installed ?? []);
  const record = <A, E>(
    surface: RecordedManagerSurface,
    effect: Effect.Effect<A, E, ManagerRequirements>,
  ): Effect.Effect<A, E, ManagerRequirements> =>
    Effect.sync(() => surfaces.push(surface)).pipe(Effect.andThen(effect));

  const manager: ExtensionManager<TRef, MaterializationFacts, ManagerRequirements> = {
    type: args.type,
    isInstalled: ({ target }) => Effect.succeed(installed.has(target.name)),
    materializeInstall: ({ ref }) =>
      record(
        "materializeInstall",
        Effect.sync(() => {
          installed.add(targetFromRef(ref).name);
          return NO_FACTS;
        }),
      ),
    materializeUninstall: ({ target }) =>
      record(
        "materializeUninstall",
        Effect.sync(() => {
          installed.delete(target.name);
          return NO_FACTS;
        }),
      ),
    materializeDeactivate: () => record("materializeDeactivate", Effect.succeed(NO_FACTS)),
    getConfiguredSource: ({ target }) =>
      Effect.succeed(configured.has(target.name) ? Option.some("workspace:") : Option.none()),
    isConfigured: ({ target }) => Effect.succeed(configured.has(target.name)),
    listMaterializable: () => record("listMaterializable", Effect.succeed(args.materializable)),
    upsertSettingsEntry: ({ ref }) =>
      record(
        "upsertSettingsEntry",
        Effect.sync(() => {
          configured.add(targetFromRef(ref).name);
        }),
      ),
    removeSettingsEntry: ({ target }) =>
      record(
        "removeSettingsEntry",
        Effect.sync(() => {
          configured.delete(target.name);
        }),
      ),
    upsertLockfileEntry: () => record("upsertLockfileEntry", Effect.void),
    removeLockfileEntry: () => record("removeLockfileEntry", Effect.void),
  };

  return { manager, surfaces, configured, installed };
};

/** A retention policy that never retains a package for an installed Pack. */
export const noUninstallRetention: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};

/** A retention policy that always retains, for the retained-by-pack settlement. */
export const alwaysUninstallRetention: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(true),
};

/**
 * A structural serialization of a recipe's typed failure: the producing
 * family's own detail sentence under an `internal` category. Assertions bind
 * to this mapping, not to the application boundary's wording.
 */
export const structuralStepFailure = <F>(failure: CallerStepFailure<F>): StepFailure => {
  const detail =
    typeof failure === "object" &&
    failure !== null &&
    "detail" in failure &&
    typeof failure.detail === "string"
      ? failure.detail
      : String(failure);
  return new StepFailure({ category: "internal", detail, cause: failure });
};

/** A retention target's plan-step identity, for assertions on recorded steps. */
export const recordedTargetName = (target: ExtensionTarget): string => target.name;

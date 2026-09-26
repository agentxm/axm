/** Shared lifecycle members for per-type materialization managers. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  configuredRowsByName,
  isObservedInstalled,
  prepareAcceptedCanonicalTransition,
  usableAcceptedCanonical,
  usableAcceptedCanonicalRef,
  type ConfiguredRecordRow,
  type ExtensionTarget,
  type SettingsReaderService,
  type WorkspaceLayout,
  type WorkspaceRecordsService,
} from "../desired-state/index.js";
import { LifecyclePostconditionViolated } from "../transitions/planning/index.js";
import type { ExtensionManagerFailure } from "./errors.js";
import type { ManagerRequirements } from "./manager-contract.js";

type RefFor<T extends InstallableExtensionType> = Extract<ExtensionRef, { readonly type: T }>;
type TargetFor<T extends InstallableExtensionType> = Extract<ExtensionTarget, { readonly type: T }>;

export const isExtensionRefOfType =
  <T extends InstallableExtensionType>(type: T) =>
  (ref: ExtensionRef): ref is Extract<ExtensionRef, { readonly type: T }> =>
    ref.type === type;

export interface BaseManagerMembersArgs<
  T extends InstallableExtensionType,
  TFacts,
  R extends ManagerRequirements,
> {
  readonly type: T;
  readonly spanPrefix: string;
  readonly records: WorkspaceRecordsService;
  readonly settings: SettingsReaderService;
  readonly refName: (ref: RefFor<T>) => string;
  readonly materializeInstall: (args: {
    readonly ref: RefFor<T>;
    readonly force?: boolean;
  }) => Effect.Effect<TFacts, ExtensionManagerFailure, R>;
  /** How a verified retained package is realized; normally install from its accepted ref. */
  readonly retained?: (args: {
    readonly target: TargetFor<T>;
    readonly ref: RefFor<T>;
  }) => Effect.Effect<TFacts, ExtensionManagerFailure, R>;
}

export const makeBaseManagerMembers = <
  T extends InstallableExtensionType,
  TFacts,
  R extends ManagerRequirements,
>(
  args: BaseManagerMembersArgs<T, TFacts, R>,
) => ({
  isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
    isObservedInstalled(args.records, args.type, target.name).pipe(
      Effect.withSpan(`${args.spanPrefix}.isInstalled`),
    ),
  materializeRetained: ({ target }: { readonly target: TargetFor<T> }) =>
    Effect.gen(function* () {
      const canonical = yield* usableAcceptedCanonical({ type: args.type, name: target.name });
      if (Option.isNone(canonical) || !isExtensionRefOfType(args.type)(canonical.value.ref)) {
        return yield* new LifecyclePostconditionViolated({
          postcondition: "materialize-observable",
          targetType: args.type,
          targetName: target.name,
        });
      }
      const ref = canonical.value.ref;
      const realize =
        args.retained === undefined
          ? args.materializeInstall({ ref })
          : args.retained({ target, ref });
      return yield* realize;
    }).pipe(Effect.withSpan(`${args.spanPrefix}.materializeRetained`)),
  prepareSourceTransition: ({ ref }: { readonly ref: RefFor<T> }) =>
    prepareAcceptedCanonicalTransition({
      type: args.type,
      name: args.refName(ref),
      ref,
    }).pipe(Effect.withSpan(`${args.spanPrefix}.prepareSourceTransition`)),
  getConfiguredSource: ({ target }: { readonly target: ExtensionTarget }) =>
    args.settings.entries(args.type).pipe(
      Effect.map((configured) => Option.fromUndefinedOr(configured[target.name]?.source)),
      Effect.withSpan(`${args.spanPrefix}.getConfiguredSource`),
    ),
});

export const listMaterializableFromAccepted = <T extends InstallableExtensionType>(args: {
  readonly type: T;
  readonly names: Effect.Effect<
    ReadonlyArray<string>,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}): Effect.Effect<
  ReadonlyArray<Extract<ExtensionRef, { readonly type: T }>>,
  ExtensionManagerFailure,
  ManagerRequirements
> =>
  Effect.gen(function* () {
    const names = yield* args.names;
    const refs = yield* Effect.forEach(
      names,
      (name) =>
        usableAcceptedCanonicalRef({ type: args.type, name }).pipe(
          Effect.map(Option.filter(isExtensionRefOfType(args.type))),
        ),
      { concurrency: 16 },
    );
    return refs.flatMap((ref) => (Option.isSome(ref) ? [ref.value] : []));
  });

export interface DiskRefEnvironment {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly baseDir: string;
  readonly scope: WorkspaceScope;
  readonly layout: WorkspaceLayout;
}

export const listMaterializableFromDisk = <TRef extends ExtensionRef>(args: {
  readonly type: TRef["type"];
  readonly records: WorkspaceRecordsService;
  /** A caller composing disk and accepted refs may already have read the rows. */
  readonly configured?: Readonly<Record<string, ConfiguredRecordRow>>;
  readonly toDiskRefs: (
    env: DiskRefEnvironment,
    configured: Readonly<Record<string, ConfiguredRecordRow>>,
  ) => Effect.Effect<ReadonlyArray<TRef>, ExtensionManagerFailure>;
  readonly env: DiskRefEnvironment;
}): Effect.Effect<
  ReadonlyArray<TRef>,
  ExtensionManagerFailure,
  FileSystem.FileSystem | Path.Path
> =>
  (args.configured === undefined
    ? args.records.rows(args.type).pipe(Effect.map(configuredRowsByName))
    : Effect.succeed(args.configured)
  ).pipe(Effect.flatMap((configured) => args.toDiskRefs(args.env, configured)));

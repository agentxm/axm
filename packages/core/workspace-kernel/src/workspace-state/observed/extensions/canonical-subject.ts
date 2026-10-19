/**
 * One observed subject for every extension type whose declared, resolved and
 * actual layers follow the canonical rules: rules, hooks, knowledge and
 * subagents.
 *
 * Declared rows come from the type's settings map and resolved rows from its
 * lockfile map, both read through the type-indexed entry accessors. Actual
 * rows come from the canonical-extensions scanner, plus any extra
 * occurrences the subject module composes in (subagents add agent-dir
 * renderings). The projection policy is the same for every such type, so it
 * is written once here; skills, MCP servers and Packs carry their own rules
 * and stay in their own modules.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Lockfile } from "../../desired/lockfile/schema.js";
import type { Settings } from "../../desired/settings/schema.js";
import type { LockfileReadError } from "../../desired/lockfile/errors.js";
import type { SettingsReadError } from "../../desired/settings/errors.js";
import {
  lockEntries,
  settingsEntries,
  type LockEntryByType,
  type SettingsEntryByType,
} from "../../workspace/entry-accessors.js";
import type { CanonicalExtensionOccurrence } from "../scanners/types.js";
import type {
  ActivationState,
  ExtensionKey,
  InstallationOrigin,
  InstalledPackRef,
  Scope,
} from "../types.js";
import { filterMapOccurrences } from "./actual-helpers.js";
import { canonicalAxmPackageRoot } from "./package-root.js";
import {
  makeProjectedSubjectCells,
  projectInstalledExtensions,
  projectPackMemberRows,
  type PackMemberBinding,
  type SubjectPolicy,
} from "./projection.js";

export type CanonicalSubjectType = "rule" | "hook" | "knowledge" | "subagent";

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredExtension<T extends CanonicalSubjectType> {
  readonly name: ExtensionName;
  readonly entry: SettingsEntryByType[T];
}

export interface ResolvedExtension<T extends CanonicalSubjectType> {
  readonly name: ExtensionName;
  readonly lockEntry: LockEntryByType[T];
}

/** The origin of an occurrence found in a canonical package root. */
export interface CanonicalOrigin<T extends CanonicalSubjectType> {
  readonly _tag: `canonical-axm-${T}`;
}

export interface ActualExtension<
  T extends CanonicalSubjectType,
  TOrigin extends { readonly _tag: string } = CanonicalOrigin<T>,
> {
  readonly key: ExtensionKey<T>;
  readonly origin: TOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}

export interface SubjectPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledExtension<T extends CanonicalSubjectType, TActual> {
  readonly key: ExtensionKey<T>;
  readonly installationOrigin: InstallationOrigin<DeclaredExtension<T>, SubjectPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedExtension<T>>;
  readonly actual: ReadonlyArray<TActual>;
}

export interface UnmanagedExtension<T extends CanonicalSubjectType, TActual> {
  readonly key: ExtensionKey<T>;
  readonly actual: TActual;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SubjectScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface CanonicalSubjectDeps {
  readonly scope: Scope;
  readonly loaders: SubjectScopedLoaders;
  readonly scanners: {
    readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
  };
}

export interface CanonicalSubjectApi<T extends CanonicalSubjectType, TActual> {
  readonly declared: Effect.Effect<
    Option.Option<ReadonlyArray<DeclaredExtension<T>>>,
    SettingsReadError
  >;
  readonly resolved: Effect.Effect<
    Option.Option<ReadonlyArray<ResolvedExtension<T>>>,
    LockfileReadError
  >;
  readonly actual: Effect.Effect<ReadonlyArray<TActual>>;
  readonly installed: Effect.Effect<
    ReadonlyArray<InstalledExtension<T, TActual>>,
    SettingsReadError | LockfileReadError
  >;
  readonly byName: (
    name: string,
  ) => Effect.Effect<
    Option.Option<InstalledExtension<T, TActual>>,
    SettingsReadError | LockfileReadError
  >;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredExtension<T>>, SettingsReadError>;
  /** Rows for the Pack-supplied members the desired-state graph bound to this subject. */
  readonly packMemberRows: (
    bindings: ReadonlyArray<PackMemberBinding>,
  ) => Effect.Effect<
    ReadonlyArray<InstalledExtension<T, TActual>>,
    SettingsReadError | LockfileReadError
  >;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedExtension<T, TActual>>,
    SettingsReadError | LockfileReadError
  >;
}

/** The rows the canonical scanner observed for `type`. */
export const canonicalActuals = <T extends CanonicalSubjectType>(
  type: T,
  scope: Scope,
  canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>,
): Effect.Effect<ReadonlyArray<ActualExtension<T>>> =>
  canonical.pipe(
    Effect.map((occurrences) =>
      filterMapOccurrences(occurrences, type, (occurrence) => ({
        key: { scope, type, name: occurrence.name },
        origin: { _tag: `canonical-axm-${type}` as const },
        contentRoot: occurrence.contentLocation,
        packageRoot: canonicalAxmPackageRoot(occurrence),
      })),
    ),
  );

const canonicalPolicy = <
  T extends CanonicalSubjectType,
  TActual extends { readonly key: ExtensionKey<T> },
>(
  type: T,
  scope: Scope,
): SubjectPolicy<
  ReadonlyArray<DeclaredExtension<T>>,
  ReadonlyArray<ResolvedExtension<T>>,
  ReadonlyArray<TActual>,
  SubjectPackMember,
  InstalledExtension<T, TActual>,
  UnmanagedExtension<T, TActual>
> => ({
  declaredEntries: (declared) => declared,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.entry.enabled === false ? "disabled" : "enabled"),
  declaresAcquisition: (entry) => entry.entry.source !== undefined,
  resolvedEntries: (resolved) => resolved,
  resolvedName: (entry) => entry.name,
  actualEntries: (actual) => actual,
  actualName: (entry) => entry.key.name,
  packMember: ({ name, pack }) => ({ name, providingPack: pack }),
  attachActualToInstalled: (name, actual) => actual.filter((entry) => entry.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type, name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type, name: entry.key.name },
    actual: entry,
  }),
});

/**
 * Build the observed subject for one canonical extension type over the actual
 * rows its module composes. Returns an `Effect` because the projection cell is
 * wrapped in `Effect.cached` so the derived cells share one in-flight
 * execution per scope.
 */
export const makeCanonicalSubjectApi = <
  T extends CanonicalSubjectType,
  TActual extends { readonly key: ExtensionKey<T> },
>(
  type: T,
  deps: {
    readonly scope: Scope;
    readonly loaders: SubjectScopedLoaders;
    readonly actual: Effect.Effect<ReadonlyArray<TActual>>;
  },
): Effect.Effect<CanonicalSubjectApi<T, TActual>> =>
  Effect.gen(function* () {
    const { scope, loaders, actual } = deps;
    const declared = loaders.settings.pipe(
      Effect.map(
        Option.map((settings) =>
          Object.entries(settingsEntries[type].entries(settings)).map(
            ([name, entry]): DeclaredExtension<T> => ({
              name: decodeExtensionNameSync(name),
              entry,
            }),
          ),
        ),
      ),
    );
    const resolved = loaders.lockfile.pipe(
      Effect.map(
        Option.map((lockfile) =>
          Object.entries(lockEntries[type].entries(lockfile)).map(
            ([name, lockEntry]): ResolvedExtension<T> => ({
              name: decodeExtensionNameSync(name),
              lockEntry,
            }),
          ),
        ),
      ),
    );

    const policy = canonicalPolicy<T, TActual>(type, scope);
    const project = yield* Effect.cached(
      projectInstalledExtensions({ declared, resolved, actual, policy }),
    );

    return {
      ...makeProjectedSubjectCells({ declared, resolved, actual, project }),
      packMemberRows: (bindings) =>
        projectPackMemberRows({ bindings, declared, resolved, actual, policy }),
    } satisfies CanonicalSubjectApi<T, TActual>;
  });

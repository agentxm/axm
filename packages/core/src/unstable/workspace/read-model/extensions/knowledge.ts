/**
 * Knowledge subject module: declared/resolved/actual payloads, scanner
 * composition, and projections via the shared helper.
 *
 * Declared bundles come from `settings.knowledge`; resolved bundles come from
 * `axm-lock.yaml` `knowledge`. Actual occurrences come exclusively from the
 * canonical-extensions scanner (`type === "knowledge"`), which enumerates
 * `.axm/extensions/<owner>/knowledge/<name>/src` and
 * `.axm/extensions/external/knowledge/<name>`.
 *
 * Knowledge installs also write two derived artifacts — the `.axm/knowledge/index.md`
 * catalog and the discovery region inside the agent instructions file. Both live
 * outside `.axm/extensions`, so the canonical scanner never sees them and they
 * cannot become occurrences; `actual` is therefore scoped to the materialized
 * bundle package directory by construction.
 *
 * Pack-resolved Knowledge members participate in the same direct-over-pack
 * projection as every other extension type.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { KnowledgeLockEntry, Lockfile } from "../../../lockfile/schema.js";
import type { KnowledgeEntry, Settings } from "../../../settings/schema.js";
import type { Diagnostics, Warning } from "../diagnostics.js";
import type { LockfileReadError, SettingsReadError } from "../errors.js";
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
  type SubjectPolicy,
} from "./projection.js";

// ---------------------------------------------------------------------------
// Detection origin
// ---------------------------------------------------------------------------

export type KnowledgeDetectionOrigin =
  { readonly _tag: "canonical-axm-knowledge" } | { readonly _tag: "external-axm-knowledge" };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredKnowledgeBundle {
  readonly name: ExtensionName;
  readonly entry: KnowledgeEntry;
}
export type DeclaredKnowledge = ReadonlyArray<DeclaredKnowledgeBundle>;

export interface ResolvedKnowledgeBundle {
  readonly name: ExtensionName;
  readonly lockEntry: KnowledgeLockEntry;
}
export type ResolvedKnowledge = ReadonlyArray<ResolvedKnowledgeBundle>;

export interface ActualKnowledgeBundle {
  readonly key: ExtensionKey<"knowledge">;
  readonly origin: KnowledgeDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualKnowledge = ReadonlyArray<ActualKnowledgeBundle>;

export interface KnowledgePackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledKnowledgeBundle {
  readonly key: ExtensionKey<"knowledge">;
  readonly installationOrigin: InstallationOrigin<DeclaredKnowledgeBundle, KnowledgePackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedKnowledgeBundle>;
  readonly actual: ReadonlyArray<ActualKnowledgeBundle>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedKnowledgeBundle {
  readonly key: ExtensionKey<"knowledge">;
  readonly actual: ActualKnowledgeBundle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canonicalToActual = (
  occ: CanonicalExtensionOccurrence,
  scope: Scope,
): ActualKnowledgeBundle => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "knowledge", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-knowledge" } : { _tag: "canonical-axm-knowledge" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

const declaredFromSettings = (settings: Settings): DeclaredKnowledge => {
  if (settings.knowledge === undefined) return [];
  return Object.entries(settings.knowledge).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedKnowledge => {
  if (lockfile.knowledge === undefined) return [];
  return Object.entries(lockfile.knowledge).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface KnowledgeScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface KnowledgeScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface KnowledgeExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: KnowledgeScopedLoaders;
  readonly scanners: KnowledgeScanners;
  readonly installedPacks: Effect.Effect<
    ReadonlyArray<InstalledPackForKnowledge>,
    SettingsReadError | LockfileReadError
  >;
  readonly diagnostics: Diagnostics;
}

export interface InstalledPackForKnowledge {
  readonly ref: InstalledPackRef;
  readonly knowledge: ReadonlyArray<KnowledgePackMember>;
}

export interface KnowledgeExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredKnowledge>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedKnowledge>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualKnowledge>;
  readonly installed: Effect.Effect<
    ReadonlyArray<InstalledKnowledgeBundle>,
    SettingsReadError | LockfileReadError
  >;
  readonly byName: (
    name: string,
  ) => Effect.Effect<
    Option.Option<InstalledKnowledgeBundle>,
    SettingsReadError | LockfileReadError
  >;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredKnowledgeBundle>, SettingsReadError>;
  readonly active: Effect.Effect<
    ReadonlyArray<InstalledKnowledgeBundle>,
    SettingsReadError | LockfileReadError
  >;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedKnowledgeBundle>,
    SettingsReadError | LockfileReadError
  >;
}

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `knowledge: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const knowledgePolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredKnowledge,
  ResolvedKnowledge,
  ActualKnowledge,
  KnowledgePackMember,
  InstalledKnowledgeBundle,
  UnmanagedKnowledgeBundle
> => ({
  declaredEntries: (d) => d,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.entry.enabled === false ? "disabled" : "enabled"),
  resolvedEntries: (r) => r,
  resolvedName: (entry) => entry.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMemberName: (member) => member.name,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "knowledge", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "knowledge", name: entry.key.name },
    actual: entry,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the knowledge subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeKnowledgeExtensionsApi = (
  deps: KnowledgeExtensionsApiDeps,
): Effect.Effect<KnowledgeExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, scanners, diagnostics } = deps;

    const declared: KnowledgeExtensionsApi["declared"] = deps.loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: KnowledgeExtensionsApi["resolved"] = deps.loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: KnowledgeExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "knowledge", (occ) => canonicalToActual(occ, scope));
    });

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        declared,
        resolved,
        actual,
        installedPacks: deps.installedPacks,
        packMembers: (pack: {
          readonly knowledge: ReadonlyArray<KnowledgePackMember>;
        }): ReadonlyArray<KnowledgePackMember> => pack.knowledge,
        packRef: (pack) => pack.ref,
        policy: knowledgePolicy(scope),
        diagnostics,
      }),
    );

    return {
      ...makeProjectedSubjectCells({
        declared,
        resolved,
        actual,
        project,
      }),
      declared,
      resolved,
      actual,
    } satisfies KnowledgeExtensionsApi;
  });

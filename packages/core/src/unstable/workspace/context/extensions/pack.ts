/**
 * Pack subject module: declared/resolved/actual payloads, scanner composition,
 * and **direct-only** installed projections via the shared helper.
 *
 * Per Decision 9 of the workspace-context design: packs cannot be members of
 * other packs. The pack subject's own `installed` projection therefore passes
 * an empty installed-pack set into the projection helper, so no pack-member
 * row is ever produced for a pack. Direct pack declarations remain the only
 * way a pack appears in `installed`.
 *
 * Resolved member groups (`resolvedSkills`, `resolvedCommands`,
 * `resolvedMcpServers`, `resolvedSubagents`) read from the installed pack
 * lockfile entry. Phase 9 threads these maps into other subjects'
 * `installedPacks` inputs so pack-provided members surface as implicit
 * installed rows on those subjects (skill, command, mcp-server, subagent).
 *
 * MCP servers and packs use activation `enabled` by policy and do not
 * duplicate a no-op enabled field in declared settings; the projection row
 * supplies activation for generic consumers.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  decodeExtensionNameSync,
  parseFullyQualifiedNameParts,
  type ExtensionName,
} from "../../../extensions/common.js";
import type { ExtensionPackLockEntry, Lockfile } from "../../../lockfile/schema.js";
import type { ExtensionPackEntry, Settings } from "../../../settings/schema.js";
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

export type PackDetectionOrigin =
  | { readonly _tag: "canonical-axm-pack" }
  | { readonly _tag: "external-axm-pack" };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredPack {
  readonly name: ExtensionName;
  readonly entry: ExtensionPackEntry;
}
export type DeclaredPacks = ReadonlyArray<DeclaredPack>;

/**
 * Resolved pack carrying the lockfile entry verbatim. Member groups are
 * available as `lockEntry.resolvedSkills` / `resolvedCommands` /
 * `resolvedMcpServers` / `resolvedSubagents`. Subject modules read these
 * maps when assembling pack-member input for the projection helper.
 */
export interface ResolvedPack {
  readonly keyName: string;
  readonly name: ExtensionName;
  readonly lockEntry: ExtensionPackLockEntry;
}
export type ResolvedPacks = ReadonlyArray<ResolvedPack>;

export interface ActualPack {
  readonly key: ExtensionKey<"pack">;
  readonly origin: PackDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualPacks = ReadonlyArray<ActualPack>;

/**
 * Pack member entry carrying enough info to identify the source pack. Pack
 * subjects do not produce member rows (packs are not pack members), but the
 * shared projection helper still type-parameters its pack-member type, so we
 * supply a never-instantiated placeholder.
 */
export type PackPackMember = never;

/**
 * Installed pack row. The installation origin union is widened only to
 * `direct` because packs cannot be pack members. Generic consumers reading
 * `installationOrigin._tag` always observe `"direct"` on a pack row.
 */
export interface InstalledPack {
  readonly key: ExtensionKey<"pack">;
  readonly installationOrigin: InstallationOrigin<DeclaredPack, PackPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedPack>;
  readonly actual: ReadonlyArray<ActualPack>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedPack {
  readonly key: ExtensionKey<"pack">;
  readonly actual: ActualPack;
}

export type IgnoredPackCandidate =
  | {
      readonly key: ExtensionKey<"pack">;
      readonly reason: "declared-ignored";
      readonly declared: DeclaredPack;
    }
  | {
      readonly key: ExtensionKey<"pack">;
      readonly reason: "actual-ignored";
      readonly actual: ActualPack;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const declaredFromSettings = (settings: Settings): DeclaredPacks => {
  if (settings.packs === undefined) return [];
  return Object.entries(settings.packs).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedPacks => {
  if (lockfile.packs === undefined) return [];
  return Object.entries(lockfile.packs).map(([keyName, lockEntry]) => {
    const parsed = parseFullyQualifiedNameParts(keyName);
    return {
      keyName,
      name: parsed?.name ?? decodeExtensionNameSync(keyName),
      lockEntry,
    };
  });
};

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualPack => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "pack", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-pack" } : { _tag: "canonical-axm-pack" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PackScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface PackScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface PackExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: PackScopedLoaders;
  readonly scanners: PackScanners;
  readonly ignoredNames: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

export interface PackExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredPacks>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedPacks>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualPacks>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledPack>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledPack>>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredPack>, SettingsReadError>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledPack>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedPack>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredPackCandidate>>;
}

const SUBJECT_KEY = "pack";

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `pack: lockfile entry "${name}" has no matching declared pack`,
  code: "orphan-resolved",
});

const packPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredPacks,
  ResolvedPacks,
  ActualPacks,
  PackPackMember,
  InstalledPack,
  UnmanagedPack,
  IgnoredPackCandidate
> => ({
  declaredEntries: (d) => d,
  declaredName: (e) => e.name,
  // Packs have no `enabled` flag — activation is always "enabled".
  declaredActivation: () => "enabled",
  resolvedEntries: (r) => r,
  resolvedName: (e) => e.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  // Pack-member callbacks are unreachable: the subject passes an empty
  // installed-pack set into the projection helper, so the helper never
  // invokes these. The functions still need to satisfy the types.
  packMemberName: (member) => member,
  isIgnoredName: (name, ignored) => ignored.has(name),
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "pack", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "pack", name: entry.key.name },
    actual: entry,
  }),
  buildDeclaredIgnoredRow: (input) => ({
    key: { scope, type: "pack", name: input.name },
    reason: "declared-ignored",
    declared: input.declared,
  }),
  // `TPackMember = never` for packs (packs cannot be pack members), so
  // `input.member` has type `never`. Returning it satisfies any `TIgnored`
  // statically without a throw — the body is uninhabitable at runtime.
  buildPackMemberIgnoredRow: (input) => input.member,
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "pack", name: input.name },
    reason: "actual-ignored",
    actual: input.actual,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the pack subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makePackExtensionsApi = (
  deps: PackExtensionsApiDeps,
): Effect.Effect<PackExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, loaders, scanners, ignoredNames, diagnostics } = deps;

    const declared: PackExtensionsApi["declared"] = loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: PackExtensionsApi["resolved"] = loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: PackExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "pack", (occ) => canonicalToActual(occ, scope));
    });

    // Packs can't be pack members — pass an empty installed-pack set.
    const installedPacks: Effect.Effect<
      ReadonlyArray<{
        readonly ref: InstalledPackRef;
        readonly members: ReadonlyArray<PackPackMember>;
      }>
    > = Effect.succeed([]);

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        subjectKey: SUBJECT_KEY,
        declared,
        resolved,
        actual,
        installedPacks,
        packMembers: (pack) => pack.members,
        packRef: (pack) => pack.ref,
        ignoredNames,
        policy: packPolicy(scope),
        diagnostics,
      }),
    );

    return makeProjectedSubjectCells({
      declared,
      resolved,
      actual,
      project,
    }) satisfies PackExtensionsApi;
  });

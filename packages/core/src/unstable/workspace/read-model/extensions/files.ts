/**
 * files subject module: declared/resolved/actual payloads, scanner composition,
 * and projections via the shared helper.
 *
 * Declared packages come from `settings.files`; resolved packages come from
 * `axm-lock.yaml` `files`. Actual occurrences come exclusively from the
 * canonical-extensions scanner (`type === "files"`); no agent registers a
 * files rendering directory. Pack members arrive through the pack lock
 * `resolvedFiles` map.
 *
 * The projection helper still owns ignored/unmanaged behavior: a canonical
 * files occurrence whose name matches an ignored pattern produces an ignored
 * row; otherwise it surfaces in `unmanaged`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { FilesLockEntry, Lockfile } from "../../../lockfile/schema.js";
import type { FilesEntry, Settings } from "../../../settings/schema.js";
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
import { matchesIgnoredPattern } from "./ignore-patterns.js";
import { canonicalAxmPackageRoot } from "./package-root.js";
import {
  makeProjectedSubjectCells,
  projectInstalledExtensions,
  type SubjectPolicy,
} from "./projection.js";

// ---------------------------------------------------------------------------
// Detection origin
// ---------------------------------------------------------------------------

export type FilesDetectionOrigin =
  { readonly _tag: "canonical-axm-file" } | { readonly _tag: "external-axm-file" };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredFilesPackage {
  readonly name: ExtensionName;
  readonly entry: FilesEntry;
}
export type DeclaredFiles = ReadonlyArray<DeclaredFilesPackage>;

export interface ResolvedFilesPackage {
  readonly name: ExtensionName;
  readonly lockEntry: FilesLockEntry;
}
export type ResolvedFiles = ReadonlyArray<ResolvedFilesPackage>;

export interface ActualFilesPackage {
  readonly key: ExtensionKey<"files">;
  readonly origin: FilesDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualFiles = ReadonlyArray<ActualFilesPackage>;

export interface FilesPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledFilesPackage {
  readonly key: ExtensionKey<"files">;
  readonly installationOrigin: InstallationOrigin<DeclaredFilesPackage, FilesPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedFilesPackage>;
  readonly actual: ReadonlyArray<ActualFilesPackage>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedFilesPackage {
  readonly key: ExtensionKey<"files">;
  readonly actual: ActualFilesPackage;
}

export type IgnoredFilesCandidate =
  | {
      readonly key: ExtensionKey<"files">;
      readonly reason: "declared-ignored";
      readonly declared: DeclaredFilesPackage;
    }
  | {
      readonly key: ExtensionKey<"files">;
      readonly reason: "pack-member-ignored";
      readonly member: FilesPackMember;
      readonly pack: InstalledPackRef;
    }
  | {
      readonly key: ExtensionKey<"files">;
      readonly reason: "actual-ignored";
      readonly actual: ActualFilesPackage;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualFilesPackage => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "files", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-file" } : { _tag: "canonical-axm-file" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

const declaredFromSettings = (settings: Settings): DeclaredFiles => {
  if (settings.files === undefined) return [];
  return Object.entries(settings.files).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedFiles => {
  if (lockfile.files === undefined) return [];
  return Object.entries(lockfile.files).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FilesScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface FilesScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface InstalledPackForFiles {
  readonly ref: InstalledPackRef;
  readonly files: ReadonlyArray<FilesPackMember>;
}

export interface FilesExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: FilesScopedLoaders;
  readonly scanners: FilesScanners;
  readonly installedPacks: Effect.Effect<ReadonlyArray<InstalledPackForFiles>>;
  readonly ignoredNames: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

export interface FilesExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredFiles>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedFiles>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualFiles>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledFilesPackage>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledFilesPackage>>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredFilesPackage>, SettingsReadError>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledFilesPackage>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedFilesPackage>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredFilesCandidate>>;
}

const SUBJECT_KEY = "files";

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `files: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const filesPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredFiles,
  ResolvedFiles,
  ActualFiles,
  FilesPackMember,
  InstalledFilesPackage,
  UnmanagedFilesPackage,
  IgnoredFilesCandidate
> => ({
  declaredEntries: (d) => d,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.entry.enabled === false ? "disabled" : "enabled"),
  resolvedEntries: (r) => r,
  resolvedName: (entry) => entry.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMemberName: (m) => m.name,
  isIgnoredName: matchesIgnoredPattern,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "files", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "files", name: entry.key.name },
    actual: entry,
  }),
  buildDeclaredIgnoredRow: (input) => ({
    key: { scope, type: "files", name: input.name },
    reason: "declared-ignored",
    declared: input.declared,
  }),
  buildPackMemberIgnoredRow: (input) => ({
    key: { scope, type: "files", name: input.name },
    reason: "pack-member-ignored",
    member: input.member,
    pack: input.pack,
  }),
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "files", name: input.name },
    reason: "actual-ignored",
    actual: input.actual,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the files subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeFilesExtensionsApi = (
  deps: FilesExtensionsApiDeps,
): Effect.Effect<FilesExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, scanners, ignoredNames, diagnostics } = deps;

    const declared: FilesExtensionsApi["declared"] = deps.loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: FilesExtensionsApi["resolved"] = deps.loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: FilesExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "files", (occ) => canonicalToActual(occ, scope));
    });

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        subjectKey: SUBJECT_KEY,
        declared,
        resolved,
        actual,
        installedPacks: deps.installedPacks,
        packMembers: (pack: {
          readonly files: ReadonlyArray<FilesPackMember>;
        }): ReadonlyArray<FilesPackMember> => pack.files,
        packRef: (pack) => pack.ref,
        ignoredNames,
        policy: filesPolicy(scope),
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
    } satisfies FilesExtensionsApi;
  });

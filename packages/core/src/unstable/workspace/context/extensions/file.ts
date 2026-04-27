/**
 * File subject module: declared/resolved/actual payloads, scanner composition,
 * and projections via the shared helper.
 *
 * Files have no `settings.json` entry shape and no `axm-lock.yaml` entry
 * shape in v1; `declared` and `resolved` cells therefore return
 * `Option.none()` permanently. Actual occurrences come exclusively from the
 * canonical-extensions scanner (`type === "file"`); no agent registers a
 * file rendering directory.
 *
 * The projection helper still owns ignored/unmanaged behavior: a canonical
 * file occurrence whose name matches an ignored pattern produces an ignored
 * row; otherwise it surfaces in `unmanaged`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { Diagnostics, Warning } from "../diagnostics.js";
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

export type FileDetectionOrigin =
  | { readonly _tag: "canonical-axm-file" }
  | { readonly _tag: "external-axm-file" };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/**
 * v1 has no settings entry for files; the declared payload type is `never[]`
 * effectively, but the helper still wants a typed array shape.
 */
export type DeclaredFile = never;
export type DeclaredFiles = ReadonlyArray<DeclaredFile>;

export type ResolvedFile = never;
export type ResolvedFiles = ReadonlyArray<ResolvedFile>;

export interface ActualFile {
  readonly key: ExtensionKey<"file">;
  readonly origin: FileDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualFiles = ReadonlyArray<ActualFile>;

export interface FilePackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledFile {
  readonly key: ExtensionKey<"file">;
  readonly installationOrigin: InstallationOrigin<DeclaredFile, FilePackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedFile>;
  readonly actual: ReadonlyArray<ActualFile>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedFile {
  readonly key: ExtensionKey<"file">;
  readonly actual: ActualFile;
}

export type IgnoredFileCandidate = {
  readonly key: ExtensionKey<"file">;
  readonly reason: "actual-ignored";
  readonly actual: ActualFile;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualFile => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "file", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-file" } : { _tag: "canonical-axm-file" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FileScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface InstalledPackForFiles {
  readonly ref: InstalledPackRef;
  readonly files: ReadonlyArray<FilePackMember>;
}

export interface FileExtensionsApiDeps {
  readonly scope: Scope;
  readonly scanners: FileScanners;
  readonly installedPacks: Effect.Effect<ReadonlyArray<InstalledPackForFiles>>;
  readonly ignoredNames: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

export interface FileExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredFiles>>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedFiles>>;
  readonly actual: Effect.Effect<ActualFiles>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledFile>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledFile>>;
  readonly declaredByName: (name: string) => Effect.Effect<Option.Option<DeclaredFile>>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledFile>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedFile>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredFileCandidate>>;
}

const SUBJECT_KEY = "file";

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `file: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const filePolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredFiles,
  ResolvedFiles,
  ActualFiles,
  // `never` rather than `FilePackMember`: v1 emits no file pack members, so
  // the projection helper never invokes pack-member callbacks. The narrower
  // `never` lets `buildPackMemberIgnoredRow` be implemented without a throw.
  never,
  InstalledFile,
  UnmanagedFile,
  IgnoredFileCandidate
> => ({
  declaredEntries: () => [],
  declaredName: (entry) => entry,
  declaredActivation: () => "enabled",
  resolvedEntries: () => [],
  resolvedName: (entry) => entry,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  // `m: never` — the helper invocation passes `TPackMember = never`, so
  // this callback is statically uninhabitable. Returning `m` (typed as
  // `never`) satisfies the `string` return type.
  packMemberName: (m) => m,
  isIgnoredName: (name, ignored) => ignored.has(name),
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "file", name: decodeExtensionNameSync(input.name) },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "file", name: entry.key.name },
    actual: entry,
  }),
  // `DeclaredFile = never` (files have no settings entry shape), so
  // `input.declared` has type `never` and `return input.declared` satisfies
  // any `TIgnored` statically. The body is uninhabitable at runtime.
  buildDeclaredIgnoredRow: (input) => input.declared,
  // The helper invocation passes `TPackMember = never` (v1 emits no file
  // pack members), so `input.member` has type `never` and the body is
  // uninhabitable at runtime — no throw needed.
  buildPackMemberIgnoredRow: (input) => input.member,
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "file", name: decodeExtensionNameSync(input.name) },
    reason: "actual-ignored",
    actual: input.actual,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the file subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeFileExtensionsApi = (
  deps: FileExtensionsApiDeps,
): Effect.Effect<FileExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, scanners, ignoredNames, diagnostics } = deps;

    const declared: FileExtensionsApi["declared"] = Effect.succeed(Option.none<DeclaredFiles>());
    const resolved: FileExtensionsApi["resolved"] = Effect.succeed(Option.none<ResolvedFiles>());
    const actual: FileExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "file", (occ) => canonicalToActual(occ, scope));
    });

    // v1 emits no file pack members. Pass an empty installed-packs effect to
    // the projection helper with `TPackMember = never` so unreachable
    // pack-member callbacks become statically uninhabitable.
    // `deps.installedPacks` is accepted on the public dep contract but ignored
    // here until v2 wires file pack members through.
    const installedPacksForHelper: Effect.Effect<
      ReadonlyArray<{ readonly ref: InstalledPackRef; readonly members: ReadonlyArray<never> }>
    > = Effect.succeed([]);

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        subjectKey: SUBJECT_KEY,
        declared,
        resolved,
        actual,
        installedPacks: installedPacksForHelper,
        packMembers: (pack) => pack.members,
        packRef: (pack) => pack.ref,
        ignoredNames,
        policy: filePolicy(scope),
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
      declaredByName: () => Effect.succeed(Option.none()),
    } satisfies FileExtensionsApi;
  });

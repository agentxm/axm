/**
 * docs subject module: declared/resolved/actual payloads, scanner composition,
 * and projections via the shared helper.
 *
 * docs have no `settings.json` entry shape and no `axm-lock.yaml` entry
 * shape in v1; `declared` and `resolved` cells therefore return
 * `Option.none()` permanently. Actual occurrences come exclusively from the
 * canonical-extensions scanner (`type === "docs"`); no agent registers a
 * docs rendering directory.
 *
 * The projection helper still owns ignored/unmanaged behavior: a canonical
 * docs occurrence whose name matches an ignored pattern produces an ignored
 * row; otherwise it surfaces in `unmanaged`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionName } from "../../../extensions/common.js";
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

export type DocsDetectionOrigin =
  | { readonly _tag: "canonical-axm-file" }
  | { readonly _tag: "external-axm-file" };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/**
 * v1 has no settings entry for docs; the declared payload type is `never[]`
 * effectively, but the helper still wants a typed array shape.
 */
export type DeclaredDocsPackage = never;
export type DeclaredDocs = ReadonlyArray<DeclaredDocsPackage>;

export type ResolvedDocsPackage = never;
export type ResolvedDocs = ReadonlyArray<ResolvedDocsPackage>;

export interface ActualDocsPackage {
  readonly key: ExtensionKey<"docs">;
  readonly origin: DocsDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualDocs = ReadonlyArray<ActualDocsPackage>;

export interface DocsPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledDocsPackage {
  readonly key: ExtensionKey<"docs">;
  readonly installationOrigin: InstallationOrigin<DeclaredDocsPackage, DocsPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedDocsPackage>;
  readonly actual: ReadonlyArray<ActualDocsPackage>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedDocsPackage {
  readonly key: ExtensionKey<"docs">;
  readonly actual: ActualDocsPackage;
}

export type IgnoredDocsCandidate = {
  readonly key: ExtensionKey<"docs">;
  readonly reason: "actual-ignored";
  readonly actual: ActualDocsPackage;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualDocsPackage => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "docs", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-file" } : { _tag: "canonical-axm-file" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DocsScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface InstalledPackForDocs {
  readonly ref: InstalledPackRef;
  readonly docs: ReadonlyArray<DocsPackMember>;
}

export interface DocsExtensionsApiDeps {
  readonly scope: Scope;
  readonly scanners: DocsScanners;
  readonly installedPacks: Effect.Effect<ReadonlyArray<InstalledPackForDocs>>;
  readonly ignoredNames: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

export interface DocsExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredDocs>>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedDocs>>;
  readonly actual: Effect.Effect<ActualDocs>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledDocsPackage>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledDocsPackage>>;
  readonly declaredByName: (name: string) => Effect.Effect<Option.Option<DeclaredDocsPackage>>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledDocsPackage>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedDocsPackage>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredDocsCandidate>>;
}

const SUBJECT_KEY = "docs";

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `docs: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const docsPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredDocs,
  ResolvedDocs,
  ActualDocs,
  // `never` rather than `DocsPackMember`: v1 emits no docs pack members, so
  // the projection helper never invokes pack-member callbacks. The narrower
  // `never` lets `buildPackMemberIgnoredRow` be implemented without a throw.
  never,
  InstalledDocsPackage,
  UnmanagedDocsPackage,
  IgnoredDocsCandidate
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
    key: { scope, type: "docs", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "docs", name: entry.key.name },
    actual: entry,
  }),
  // `DeclaredDocsPackage = never` (docs have no settings entry shape), so
  // `input.declared` has type `never` and `return input.declared` satisfies
  // any `TIgnored` statically. The body is uninhabitable at runtime.
  buildDeclaredIgnoredRow: (input) => input.declared,
  // The helper invocation passes `TPackMember = never` (v1 emits no docs
  // pack members), so `input.member` has type `never` and the body is
  // uninhabitable at runtime — no throw needed.
  buildPackMemberIgnoredRow: (input) => input.member,
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "docs", name: input.name },
    reason: "actual-ignored",
    actual: input.actual,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the docs subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeDocsExtensionsApi = (
  deps: DocsExtensionsApiDeps,
): Effect.Effect<DocsExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, scanners, ignoredNames, diagnostics } = deps;

    const declared: DocsExtensionsApi["declared"] = Effect.succeed(Option.none<DeclaredDocs>());
    const resolved: DocsExtensionsApi["resolved"] = Effect.succeed(Option.none<ResolvedDocs>());
    const actual: DocsExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "docs", (occ) => canonicalToActual(occ, scope));
    });

    // v1 emits no docs pack members. Pass an empty installed-packs effect to
    // the projection helper with `TPackMember = never` so unreachable
    // pack-member callbacks become statically uninhabitable.
    // `deps.installedPacks` is accepted on the public dep contract but ignored
    // here until v2 wires docs pack members through.
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
        policy: docsPolicy(scope),
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
    } satisfies DocsExtensionsApi;
  });

/**
 * context subject module: declared/resolved/actual payloads, scanner composition,
 * and projections via the shared helper.
 *
 * context have no `settings.json` entry shape and no `axm-lock.yaml` entry
 * shape in v1; `declared` and `resolved` cells therefore return
 * `Option.none()` permanently. Actual occurrences come exclusively from the
 * canonical-extensions scanner (`type === "context"`); no agent registers a
 * context rendering directory.
 *
 * The projection helper still owns ignored/unmanaged behavior: a canonical
 * context occurrence whose name matches an ignored pattern produces an ignored
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

export type ContextDetectionOrigin =
  | { readonly _tag: "canonical-axm-file" }
  | { readonly _tag: "external-axm-file" };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/**
 * v1 has no settings entry for context; the declared payload type is `never[]`
 * effectively, but the helper still wants a typed array shape.
 */
export type DeclaredContextPackage = never;
export type DeclaredContext = ReadonlyArray<DeclaredContextPackage>;

export type ResolvedContextPackage = never;
export type ResolvedContext = ReadonlyArray<ResolvedContextPackage>;

export interface ActualContextPackage {
  readonly key: ExtensionKey<"context">;
  readonly origin: ContextDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualContext = ReadonlyArray<ActualContextPackage>;

export interface ContextPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledContextPackage {
  readonly key: ExtensionKey<"context">;
  readonly installationOrigin: InstallationOrigin<DeclaredContextPackage, ContextPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedContextPackage>;
  readonly actual: ReadonlyArray<ActualContextPackage>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedContextPackage {
  readonly key: ExtensionKey<"context">;
  readonly actual: ActualContextPackage;
}

export type IgnoredContextCandidate = {
  readonly key: ExtensionKey<"context">;
  readonly reason: "actual-ignored";
  readonly actual: ActualContextPackage;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canonicalToActual = (
  occ: CanonicalExtensionOccurrence,
  scope: Scope,
): ActualContextPackage => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "context", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-file" } : { _tag: "canonical-axm-file" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ContextScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface InstalledPackForContext {
  readonly ref: InstalledPackRef;
  readonly context: ReadonlyArray<ContextPackMember>;
}

export interface ContextExtensionsApiDeps {
  readonly scope: Scope;
  readonly scanners: ContextScanners;
  readonly installedPacks: Effect.Effect<ReadonlyArray<InstalledPackForContext>>;
  readonly ignoredNames: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

export interface ContextExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredContext>>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedContext>>;
  readonly actual: Effect.Effect<ActualContext>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledContextPackage>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledContextPackage>>;
  readonly declaredByName: (name: string) => Effect.Effect<Option.Option<DeclaredContextPackage>>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledContextPackage>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedContextPackage>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredContextCandidate>>;
}

const SUBJECT_KEY = "context";

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `context: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const contextPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredContext,
  ResolvedContext,
  ActualContext,
  // `never` rather than `ContextPackMember`: v1 emits no context pack members, so
  // the projection helper never invokes pack-member callbacks. The narrower
  // `never` lets `buildPackMemberIgnoredRow` be implemented without a throw.
  never,
  InstalledContextPackage,
  UnmanagedContextPackage,
  IgnoredContextCandidate
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
    key: { scope, type: "context", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "context", name: entry.key.name },
    actual: entry,
  }),
  // `DeclaredContextPackage = never` (context have no settings entry shape), so
  // `input.declared` has type `never` and `return input.declared` satisfies
  // any `TIgnored` statically. The body is uninhabitable at runtime.
  buildDeclaredIgnoredRow: (input) => input.declared,
  // The helper invocation passes `TPackMember = never` (v1 emits no context
  // pack members), so `input.member` has type `never` and the body is
  // uninhabitable at runtime — no throw needed.
  buildPackMemberIgnoredRow: (input) => input.member,
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "context", name: input.name },
    reason: "actual-ignored",
    actual: input.actual,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the context subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeContextExtensionsApi = (
  deps: ContextExtensionsApiDeps,
): Effect.Effect<ContextExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, scanners, ignoredNames, diagnostics } = deps;

    const declared: ContextExtensionsApi["declared"] = Effect.succeed(
      Option.none<DeclaredContext>(),
    );
    const resolved: ContextExtensionsApi["resolved"] = Effect.succeed(
      Option.none<ResolvedContext>(),
    );
    const actual: ContextExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "context", (occ) => canonicalToActual(occ, scope));
    });

    // v1 emits no context pack members. Pass an empty installed-packs effect to
    // the projection helper with `TPackMember = never` so unreachable
    // pack-member callbacks become statically uninhabitable.
    // `deps.installedPacks` is accepted on the public dep contract but ignored
    // here until v2 wires context pack members through.
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
        policy: contextPolicy(scope),
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
    } satisfies ContextExtensionsApi;
  });

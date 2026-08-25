/**
 * Hook subject module: declared/resolved/actual payloads, scanner composition,
 * and projections via the shared helper.
 *
 * Declared hooks come from `settings.hooks`; resolved hooks come from
 * `axm-lock.yaml` `hooks`. Actual occurrences come exclusively from the
 * canonical-extensions scanner (`type === "hook"`), which enumerates
 * project-authored `hooks/<name>/src`, project-acquired
 * `agent_extensions/<owner>/hooks/<name>/src`, and user-scope packages.
 *
 * The hook installer also writes agent-side derived artifacts — managed hook
 * groups inside agent settings files and the advisory-rule fallback region.
 * Those are renderings of an installed hook, not separate materializations, so
 * they are deliberately NOT occurrences: the family derives `actual` from the
 * canonical scanner alone and an agent-side rendering never produces an
 * unmanaged row.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { HookLockEntry, Lockfile } from "../../../lockfile/schema.js";
import type { HookEntry, Settings } from "../../../settings/schema.js";
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

export type HookDetectionOrigin =
  { readonly _tag: "canonical-axm-hook" } | { readonly _tag: "external-axm-hook" };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredHook {
  readonly name: ExtensionName;
  readonly entry: HookEntry;
}
export type DeclaredHooks = ReadonlyArray<DeclaredHook>;

export interface ResolvedHook {
  readonly name: ExtensionName;
  readonly lockEntry: HookLockEntry;
}
export type ResolvedHooks = ReadonlyArray<ResolvedHook>;

export interface ActualHook {
  readonly key: ExtensionKey<"hook">;
  readonly origin: HookDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualHooks = ReadonlyArray<ActualHook>;

export interface HookPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledHook {
  readonly key: ExtensionKey<"hook">;
  readonly installationOrigin: InstallationOrigin<DeclaredHook, HookPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedHook>;
  readonly actual: ReadonlyArray<ActualHook>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedHook {
  readonly key: ExtensionKey<"hook">;
  readonly actual: ActualHook;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualHook => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "hook", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-hook" } : { _tag: "canonical-axm-hook" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

const declaredFromSettings = (settings: Settings): DeclaredHooks => {
  if (settings.hooks === undefined) return [];
  return Object.entries(settings.hooks).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedHooks => {
  if (lockfile.hooks === undefined) return [];
  return Object.entries(lockfile.hooks).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Hook scanners. Hook packages materialize only in canonical package roots,
 * so the canonical scanner is the sole input; agent-side managed hook groups are
 * renderings of an installed hook rather than independent materializations.
 */
export interface HookScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface HookScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface InstalledPackForHooks {
  readonly ref: InstalledPackRef;
  readonly hooks: ReadonlyArray<HookPackMember>;
}

export interface HookExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: HookScopedLoaders;
  readonly scanners: HookScanners;
  readonly installedPacks: Effect.Effect<
    ReadonlyArray<InstalledPackForHooks>,
    SettingsReadError | LockfileReadError
  >;
  readonly diagnostics: Diagnostics;
}

export interface HookExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredHooks>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedHooks>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualHooks>;
  readonly installed: Effect.Effect<
    ReadonlyArray<InstalledHook>,
    SettingsReadError | LockfileReadError
  >;
  readonly byName: (
    name: string,
  ) => Effect.Effect<Option.Option<InstalledHook>, SettingsReadError | LockfileReadError>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredHook>, SettingsReadError>;
  readonly active: Effect.Effect<
    ReadonlyArray<InstalledHook>,
    SettingsReadError | LockfileReadError
  >;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedHook>,
    SettingsReadError | LockfileReadError
  >;
}

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `hook: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const hookPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredHooks,
  ResolvedHooks,
  ActualHooks,
  HookPackMember,
  InstalledHook,
  UnmanagedHook
> => ({
  declaredEntries: (d) => d,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.entry.enabled === false ? "disabled" : "enabled"),
  resolvedEntries: (r) => r,
  resolvedName: (entry) => entry.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMemberName: (m) => m.name,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "hook", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "hook", name: entry.key.name },
    actual: entry,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the hook subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeHookExtensionsApi = (
  deps: HookExtensionsApiDeps,
): Effect.Effect<HookExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, scanners, diagnostics } = deps;

    const declared: HookExtensionsApi["declared"] = deps.loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: HookExtensionsApi["resolved"] = deps.loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: HookExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "hook", (occ) => canonicalToActual(occ, scope));
    });

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        declared,
        resolved,
        actual,
        installedPacks: deps.installedPacks,
        packMembers: (pack: {
          readonly hooks: ReadonlyArray<HookPackMember>;
        }): ReadonlyArray<HookPackMember> => pack.hooks,
        packRef: (pack) => pack.ref,
        policy: hookPolicy(scope),
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
    } satisfies HookExtensionsApi;
  });

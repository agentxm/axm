/**
 * Subagent subject module: declared/resolved/actual payloads, scanner
 * composition (canonical-extensions + agent-dir × subagent-rendering agents),
 * and projections via the shared helper.
 *
 * Activation comes from the declared `enabled` flag, mirroring skills and
 * commands. Single-file subagent surfaces (e.g., `roo`'s `.roomodes`) emit
 * one occurrence per file path; the file itself is the materialization.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../../agents/types.js";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { Lockfile, SubagentLockEntry } from "../../../lockfile/schema.js";
import type { Settings, SubagentEntry } from "../../../settings/schema.js";
import type { Diagnostics, Warning } from "../diagnostics.js";
import type { LockfileReadError, SettingsReadError } from "../errors.js";
import type { AgentDirOccurrence, CanonicalExtensionOccurrence } from "../scanners/types.js";
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

export type SubagentDetectionOrigin =
  | { readonly _tag: "canonical-axm-subagent" }
  | { readonly _tag: "external-axm-subagent" }
  | { readonly _tag: "agent-subagent-dir"; readonly agentId: AgentId };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredSubagent {
  readonly name: ExtensionName;
  readonly entry: SubagentEntry;
}
export type DeclaredSubagents = ReadonlyArray<DeclaredSubagent>;

export interface ResolvedSubagent {
  readonly name: ExtensionName;
  readonly lockEntry: SubagentLockEntry;
}
export type ResolvedSubagents = ReadonlyArray<ResolvedSubagent>;

export interface ActualSubagent {
  readonly key: ExtensionKey<"subagent">;
  readonly origin: SubagentDetectionOrigin;
  readonly contentRoot: string;
  readonly sourcePath: string | null;
  readonly packageRoot: string | null;
}
export type ActualSubagents = ReadonlyArray<ActualSubagent>;

export interface SubagentPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledSubagent {
  readonly key: ExtensionKey<"subagent">;
  readonly installationOrigin: InstallationOrigin<DeclaredSubagent, SubagentPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedSubagent>;
  readonly actual: ReadonlyArray<ActualSubagent>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedSubagent {
  readonly key: ExtensionKey<"subagent">;
  readonly actual: ActualSubagent;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const declaredFromSettings = (settings: Settings): DeclaredSubagents => {
  if (settings.subagents === undefined) return [];
  return Object.entries(settings.subagents).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedSubagents => {
  if (lockfile.subagents === undefined) return [];
  return Object.entries(lockfile.subagents).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualSubagent => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "subagent", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-subagent" } : { _tag: "canonical-axm-subagent" },
    contentRoot: occ.contentLocation,
    sourcePath: Option.getOrNull(occ.subjectFile),
    packageRoot,
  };
};

const agentDirToActual = (occ: AgentDirOccurrence, scope: Scope): ActualSubagent => ({
  key: { scope, type: "subagent", name: occ.name },
  origin: { _tag: "agent-subagent-dir", agentId: occ.agentId },
  contentRoot: occ.contentLocation,
  // For directory-style subagents the scanner emits `<dir>/${name}.md`; for
  // single-file surfaces (e.g., `.roomodes`) the scanner emits the file path
  // itself. Either way `subjectFile` is `Some` for agent-dir subagent occs.
  sourcePath: Option.getOrNull(occ.subjectFile),
  packageRoot: null,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SubagentScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface SubagentScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
  readonly agentDir: Effect.Effect<ReadonlyArray<AgentDirOccurrence>>;
}

export interface InstalledPackForSubagents {
  readonly ref: InstalledPackRef;
  readonly subagents: ReadonlyArray<SubagentPackMember>;
}

export interface SubagentExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: SubagentScopedLoaders;
  readonly scanners: SubagentScanners;
  readonly installedPacks: Effect.Effect<
    ReadonlyArray<InstalledPackForSubagents>,
    SettingsReadError | LockfileReadError
  >;
  readonly diagnostics: Diagnostics;
}

export interface SubagentExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredSubagents>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedSubagents>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualSubagents>;
  readonly installed: Effect.Effect<
    ReadonlyArray<InstalledSubagent>,
    SettingsReadError | LockfileReadError
  >;
  readonly byName: (
    name: string,
  ) => Effect.Effect<Option.Option<InstalledSubagent>, SettingsReadError | LockfileReadError>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredSubagent>, SettingsReadError>;
  readonly active: Effect.Effect<
    ReadonlyArray<InstalledSubagent>,
    SettingsReadError | LockfileReadError
  >;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedSubagent>,
    SettingsReadError | LockfileReadError
  >;
}

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `subagent: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const subagentPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredSubagents,
  ResolvedSubagents,
  ActualSubagents,
  SubagentPackMember,
  InstalledSubagent,
  UnmanagedSubagent
> => ({
  declaredEntries: (d) => d,
  declaredName: (e) => e.name,
  declaredActivation: (e) => (e.entry.enabled ? "enabled" : "disabled"),
  resolvedEntries: (r) => r,
  resolvedName: (e) => e.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMemberName: (m) => m.name,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "subagent", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "subagent", name: entry.key.name },
    actual: entry,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the subagent subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeSubagentExtensionsApi = (
  deps: SubagentExtensionsApiDeps,
): Effect.Effect<SubagentExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, loaders, scanners, installedPacks, diagnostics } = deps;

    const declared: SubagentExtensionsApi["declared"] = loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: SubagentExtensionsApi["resolved"] = loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: SubagentExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      const agentDir = yield* scanners.agentDir;
      const fromCanonical = filterMapOccurrences(canonical, "subagent", (occ) =>
        canonicalToActual(occ, scope),
      );
      const fromAgentDir = filterMapOccurrences(agentDir, "subagent", (occ) =>
        agentDirToActual(occ, scope),
      );
      return [...fromCanonical, ...fromAgentDir];
    });

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        declared,
        resolved,
        actual,
        installedPacks: installedPacks.pipe(
          Effect.map((packs) => packs.map((p) => ({ ref: p.ref, members: p.subagents }))),
        ),
        packMembers: (pack: {
          readonly ref: InstalledPackRef;
          readonly members: ReadonlyArray<SubagentPackMember>;
        }) => pack.members,
        packRef: (pack) => pack.ref,
        policy: subagentPolicy(scope),
        diagnostics,
      }),
    );

    return makeProjectedSubjectCells({
      declared,
      resolved,
      actual,
      project,
    }) satisfies SubagentExtensionsApi;
  });

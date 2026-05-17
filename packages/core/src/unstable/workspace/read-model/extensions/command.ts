/**
 * Command subject module: declared/resolved/actual payloads, scanner
 * composition (canonical-extensions + agent-dir × command-rendering agents),
 * and projections via the shared helper.
 *
 * Mirrors `extensions/skill.ts` for command subjects. Activation comes from
 * the declared `enabled` flag.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../../agents/types.js";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { CommandLockEntry, Lockfile } from "../../../lockfile/schema.js";
import type { CommandEntry, Settings } from "../../../settings/schema.js";
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
import { matchesIgnoredPattern } from "./ignore-patterns.js";
import {
  makeProjectedSubjectCells,
  projectInstalledExtensions,
  type SubjectPolicy,
} from "./projection.js";

// ---------------------------------------------------------------------------
// Detection origin
// ---------------------------------------------------------------------------

export type CommandDetectionOrigin =
  | { readonly _tag: "canonical-axm-command" }
  | { readonly _tag: "external-axm-command" }
  | { readonly _tag: "agent-command-dir"; readonly agentId: AgentId };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredCommand {
  readonly name: ExtensionName;
  readonly entry: CommandEntry;
}
export type DeclaredCommands = ReadonlyArray<DeclaredCommand>;

export interface ResolvedCommand {
  readonly name: ExtensionName;
  readonly lockEntry: CommandLockEntry;
}
export type ResolvedCommands = ReadonlyArray<ResolvedCommand>;

export interface ActualCommand {
  readonly key: ExtensionKey<"command">;
  readonly origin: CommandDetectionOrigin;
  readonly contentRoot: string;
  readonly sourcePath: string | null;
  readonly packageRoot: string | null;
}
export type ActualCommands = ReadonlyArray<ActualCommand>;

export interface CommandPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledCommand {
  readonly key: ExtensionKey<"command">;
  readonly installationOrigin: InstallationOrigin<DeclaredCommand, CommandPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedCommand>;
  readonly actual: ReadonlyArray<ActualCommand>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedCommand {
  readonly key: ExtensionKey<"command">;
  readonly actual: ActualCommand;
}

export type IgnoredCommandCandidate =
  | {
      readonly key: ExtensionKey<"command">;
      readonly reason: "declared-ignored";
      readonly declared: DeclaredCommand;
    }
  | {
      readonly key: ExtensionKey<"command">;
      readonly reason: "pack-member-ignored";
      readonly member: CommandPackMember;
      readonly pack: InstalledPackRef;
    }
  | {
      readonly key: ExtensionKey<"command">;
      readonly reason: "actual-ignored";
      readonly actual: ActualCommand;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const declaredFromSettings = (settings: Settings): DeclaredCommands => {
  if (settings.commands === undefined) return [];
  return Object.entries(settings.commands).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedCommands => {
  if (lockfile.commands === undefined) return [];
  return Object.entries(lockfile.commands).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualCommand => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "command", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-command" } : { _tag: "canonical-axm-command" },
    contentRoot: occ.contentLocation,
    sourcePath: Option.getOrNull(occ.subjectFile),
    packageRoot,
  };
};

const agentDirToActual = (occ: AgentDirOccurrence, scope: Scope): ActualCommand => ({
  key: { scope, type: "command", name: occ.name },
  origin: { _tag: "agent-command-dir", agentId: occ.agentId },
  contentRoot: occ.contentLocation,
  sourcePath: Option.getOrNull(occ.subjectFile),
  packageRoot: null,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CommandScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface CommandScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
  readonly agentDir: Effect.Effect<ReadonlyArray<AgentDirOccurrence>>;
}

export interface InstalledPackForCommands {
  readonly ref: InstalledPackRef;
  readonly commands: ReadonlyArray<CommandPackMember>;
}

export interface CommandExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: CommandScopedLoaders;
  readonly scanners: CommandScanners;
  readonly installedPacks: Effect.Effect<ReadonlyArray<InstalledPackForCommands>>;
  readonly ignoredPatterns: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

export interface CommandExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredCommands>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedCommands>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualCommands>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledCommand>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledCommand>>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredCommand>, SettingsReadError>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledCommand>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedCommand>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredCommandCandidate>>;
}

const SUBJECT_KEY = "command";

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `command: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const commandPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredCommands,
  ResolvedCommands,
  ActualCommands,
  CommandPackMember,
  InstalledCommand,
  UnmanagedCommand,
  IgnoredCommandCandidate
> => ({
  declaredEntries: (d) => d,
  declaredName: (e) => e.name,
  declaredActivation: (e) => (e.entry.enabled ? "enabled" : "disabled"),
  resolvedEntries: (r) => r,
  resolvedName: (e) => e.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMemberName: (m) => m.name,
  isIgnoredName: matchesIgnoredPattern,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "command", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "command", name: entry.key.name },
    actual: entry,
  }),
  buildDeclaredIgnoredRow: (input) => ({
    key: { scope, type: "command", name: input.name },
    reason: "declared-ignored",
    declared: input.declared,
  }),
  buildPackMemberIgnoredRow: (input) => ({
    key: { scope, type: "command", name: input.name },
    reason: "pack-member-ignored",
    member: input.member,
    pack: input.pack,
  }),
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "command", name: input.name },
    reason: "actual-ignored",
    actual: input.actual,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the command subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeCommandExtensionsApi = (
  deps: CommandExtensionsApiDeps,
): Effect.Effect<CommandExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, loaders, scanners, installedPacks, ignoredPatterns, diagnostics } = deps;

    const declared: CommandExtensionsApi["declared"] = loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: CommandExtensionsApi["resolved"] = loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: CommandExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      const agentDir = yield* scanners.agentDir;
      const fromCanonical = filterMapOccurrences(canonical, "command", (occ) =>
        canonicalToActual(occ, scope),
      );
      const fromAgentDir = filterMapOccurrences(agentDir, "command", (occ) =>
        agentDirToActual(occ, scope),
      );
      return [...fromCanonical, ...fromAgentDir];
    });

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        subjectKey: SUBJECT_KEY,
        declared,
        resolved,
        actual,
        installedPacks: installedPacks.pipe(
          Effect.map((packs) => packs.map((p) => ({ ref: p.ref, members: p.commands }))),
        ),
        packMembers: (pack: {
          readonly ref: InstalledPackRef;
          readonly members: ReadonlyArray<CommandPackMember>;
        }) => pack.members,
        packRef: (pack) => pack.ref,
        ignoredNames: ignoredPatterns,
        policy: commandPolicy(scope),
        diagnostics,
      }),
    );

    return makeProjectedSubjectCells({
      declared,
      resolved,
      actual,
      project,
    }) satisfies CommandExtensionsApi;
  });

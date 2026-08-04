/**
 * Skill subject module: declared/resolved/actual payload types, scanner
 * composition, and projections via the shared `projectInstalledExtensions`
 * helper.
 *
 * Per Decision 4 (single service + per-subject modules) and Decision 9
 * (read-model rows) of the workspace read-model design, this module owns:
 *
 * - the subject-specific declared/resolved/actual payload types
 *   (`DeclaredSkills`, `ResolvedSkills`, `ActualSkills`);
 * - the subject-specific origin union (`SkillDetectionOrigin`) and
 *   skill-specific facts (`contentRoot`, `sourcePath`, `packageRoot`,
 *   `hasSkillMd`, `hasSkillJson`);
 * - scanner composition (canonical-extensions + agent-dir × skill-rendering
 *   agents);
 * - the `installed` / `active` / `unmanaged` / `ignored` projections, wired
 *   through the helper with a skill-specific `SubjectPolicy`.
 *
 * The factory `makeSkillExtensionsApi(deps)` returns a `SkillExtensionsApi`
 * with cells whose public types are dependency-closed. Phase 9 composes the
 * factory inputs (`loaders`, `scanners`, `installedPacks`, `ignoredPatterns`,
 * `diagnostics`) inside `WorkspaceReadModelLive`.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../../agents/types.js";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { Lockfile, SkillLockEntry } from "../../../lockfile/schema.js";
import type { Settings, SkillEntry } from "../../../settings/schema.js";
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
import { matchesIgnoredPattern } from "./ignore-patterns.js";
import { canonicalAxmPackageRoot } from "./package-root.js";
import {
  makeProjectedSubjectCells,
  projectInstalledExtensions,
  type SubjectPolicy,
} from "./projection.js";

// ---------------------------------------------------------------------------
// Skill detection origin (subject-owned)
// ---------------------------------------------------------------------------

/**
 * Subject-specific origin discriminator for an `ActualSkill`. Mirrors the spec
 * scenarios that distinguish canonical AXM, external AXM, and agent-rendered
 * skill directories.
 */
export type SkillDetectionOrigin =
  | { readonly _tag: "canonical-axm-skill" }
  | { readonly _tag: "external-axm-skill" }
  | { readonly _tag: "agent-skill-dir"; readonly agentId: AgentId };

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

/**
 * One declared skill entry. Wraps the raw settings entry without re-shaping
 * fields; `name` is lifted out for ergonomic lookup.
 */
export interface DeclaredSkill {
  readonly name: ExtensionName;
  readonly entry: SkillEntry;
}

/** Decoded skills declared in `settings.json`. */
export type DeclaredSkills = ReadonlyArray<DeclaredSkill>;

/** One resolved skill entry from the lockfile, wrapping the raw lock entry. */
export interface ResolvedSkill {
  readonly name: ExtensionName;
  readonly lockEntry: SkillLockEntry;
}

/** Decoded skills resolved in the lockfile. */
export type ResolvedSkills = ReadonlyArray<ResolvedSkill>;

/**
 * One observable skill materialization. Carries the subject-specific origin
 * plus skill-specific facts:
 *
 * - `contentRoot` — the directory containing the rendered skill (the same
 *   value as the underlying scanner's `contentLocation`);
 * - `sourcePath` — absolute path to the canonical content file inside
 *   `contentRoot` (`SKILL.md`); equal to `null` if the file does not exist;
 * - `packageRoot` — for canonical/external AXM, the registry-publish package
 *   root (parent of `src/<name>/`); `null` for agent-rendered skills;
 * - `hasSkillMd` — convenience boolean derived from `sourcePath`;
 * - `hasSkillJson` — placeholder for the optional `skill.json` companion file
 *   (left `false` in v1; Phase 9 wiring will flip when `agent-settings` or a
 *   future scanner detects it).
 */
export interface ActualSkill {
  readonly key: ExtensionKey<"skill">;
  readonly origin: SkillDetectionOrigin;
  readonly contentRoot: string;
  readonly sourcePath: string | null;
  readonly packageRoot: string | null;
  readonly hasSkillMd: boolean;
  readonly hasSkillJson: boolean;
}

/** Actual skills payload — array of observed materialization occurrences. */
export type ActualSkills = ReadonlyArray<ActualSkill>;

// ---------------------------------------------------------------------------
// Read-model rows
// ---------------------------------------------------------------------------

/** Pack-member entry for a skill: per Decision 9 it is the resolved member. */
export interface SkillPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

/** Installed skill row. */
export interface InstalledSkill {
  readonly key: ExtensionKey<"skill">;
  readonly installationOrigin: InstallationOrigin<DeclaredSkill, SkillPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedSkill>;
  readonly actual: ReadonlyArray<ActualSkill>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

/** Unmanaged skill row — one actual occurrence not attached to an installed row. */
export interface UnmanagedSkill {
  readonly key: ExtensionKey<"skill">;
  readonly actual: ActualSkill;
}

/** Ignored-skill candidate row. */
export type IgnoredSkillCandidate =
  | {
      readonly key: ExtensionKey<"skill">;
      readonly reason: "declared-ignored";
      readonly declared: DeclaredSkill;
    }
  | {
      readonly key: ExtensionKey<"skill">;
      readonly reason: "pack-member-ignored";
      readonly member: SkillPackMember;
      readonly pack: InstalledPackRef;
    }
  | {
      readonly key: ExtensionKey<"skill">;
      readonly reason: "actual-ignored";
      readonly actual: ActualSkill;
    };

// ---------------------------------------------------------------------------
// Helpers — declared / resolved / actual normalization
// ---------------------------------------------------------------------------

const declaredFromSettings = (settings: Settings): DeclaredSkills => {
  if (settings.skills === undefined) return [];
  return Object.entries(settings.skills).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedSkills => {
  if (lockfile.skills === undefined) return [];
  return Object.entries(lockfile.skills).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

const canonicalToActualSkill = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualSkill => {
  const isExternal = occ.origin === "external-axm";
  // canonical-axm contentLocation = `<root>/.axm/extensions/<owner>/skills/<name>/src`
  // external-axm   contentLocation = `<root>/.axm/extensions/external/skills/<name>`
  // packageRoot for canonical-axm = parent of `src/<name>/` (= `<owner>/skills/`)
  // packageRoot for external-axm  = `external/skills/`
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "skill", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-skill" } : { _tag: "canonical-axm-skill" },
    contentRoot: occ.contentLocation,
    sourcePath: Option.getOrNull(occ.subjectFile),
    packageRoot,
    hasSkillMd: occ.subjectFileExists,
    // Scanner does not probe `skill.json` yet; keep `false` until a future
    // scanner emission carries it.
    hasSkillJson: false,
  };
};

const agentDirToActualSkill = (occ: AgentDirOccurrence, scope: Scope): ActualSkill => ({
  key: { scope, type: "skill", name: occ.name },
  origin: { _tag: "agent-skill-dir", agentId: occ.agentId },
  contentRoot: occ.contentLocation,
  sourcePath: Option.getOrNull(occ.subjectFile),
  packageRoot: null,
  hasSkillMd: occ.subjectFileExists,
  // Scanner does not probe `skill.json` yet; keep `false` until a future
  // scanner emission carries it.
  hasSkillJson: false,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cached source loaders the factory captures. `Effect.cached` is applied at
 * the loader site (Phase 4); the helper just consumes whatever shape the
 * caller passes in.
 */
export interface SkillScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

/**
 * Cached scanner outputs the factory captures. The factory composes
 * canonical-extensions + agent-dir occurrences into the actual skill array.
 */
export interface SkillScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
  readonly agentDir: Effect.Effect<ReadonlyArray<AgentDirOccurrence>>;
}

/**
 * One installed-pack entry consumed by the projection. Pack-resolved member
 * groups are read from the **installed pack manifest** in Phase 9; for unit
 * tests the caller passes a synthetic shape.
 */
export interface InstalledPackForSkills {
  readonly ref: InstalledPackRef;
  readonly skills: ReadonlyArray<SkillPackMember>;
}

/**
 * Inputs `makeSkillExtensionsApi` captures.
 */
export interface SkillExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: SkillScopedLoaders;
  readonly scanners: SkillScanners;
  readonly installedPacks: Effect.Effect<ReadonlyArray<InstalledPackForSkills>>;
  readonly ignoredPatterns: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

/**
 * Public skill API exposed by `ctx.scope(scope).skills`. Cells are
 * dependency-closed and never carry `FileSystem | Path` requirements.
 */
export interface SkillExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredSkills>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedSkills>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualSkills>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledSkill>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledSkill>>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredSkill>, SettingsReadError>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledSkill>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedSkill>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredSkillCandidate>>;
}

const SUBJECT_KEY = "skill";

const simpleName = (name: ExtensionName): ExtensionName => name;

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `skill: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const skillPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredSkills,
  ResolvedSkills,
  ActualSkills,
  SkillPackMember,
  InstalledSkill,
  UnmanagedSkill,
  IgnoredSkillCandidate
> => ({
  declaredEntries: (declared) => declared,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.entry.enabled ? "enabled" : "disabled"),
  resolvedEntries: (resolved) => resolved,
  resolvedName: (entry) => simpleName(entry.name),
  actualEntries: (actual) => actual,
  actualName: (entry) => entry.key.name,
  packMemberName: (member) => simpleName(member.name),
  isIgnoredName: matchesIgnoredPattern,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "skill", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "skill", name: entry.key.name },
    actual: entry,
  }),
  buildDeclaredIgnoredRow: (input) => ({
    key: { scope, type: "skill", name: input.name },
    reason: "declared-ignored",
    declared: input.declared,
  }),
  buildPackMemberIgnoredRow: (input) => ({
    key: { scope, type: "skill", name: input.name },
    reason: "pack-member-ignored",
    member: input.member,
    pack: input.pack,
  }),
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "skill", name: input.name },
    reason: "actual-ignored",
    actual: input.actual,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the skill subject API over the captured loaders, scanners, pack set,
 * and ignored-name set.
 *
 * Returns an `Effect` because the projection cell is wrapped in
 * `Effect.cached` so all four derived cells (`installed` / `active` /
 * `unmanaged` / `ignored`) share a single in-flight execution and the
 * projection — including its diagnostic side effects — runs at most once per
 * scope, mirroring the `state.ts` loader pattern.
 */
export const makeSkillExtensionsApi = (
  deps: SkillExtensionsApiDeps,
): Effect.Effect<SkillExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, loaders, scanners, installedPacks, ignoredPatterns, diagnostics } = deps;

    const declared: SkillExtensionsApi["declared"] = loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, (settings) => declaredFromSettings(settings))),
    );

    const resolved: SkillExtensionsApi["resolved"] = loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, (lockfile) => resolvedFromLockfile(lockfile))),
    );

    const actual: SkillExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      const agentDir = yield* scanners.agentDir;
      const fromCanonical = filterMapOccurrences(canonical, "skill", (occ) =>
        canonicalToActualSkill(occ, scope),
      );
      const fromAgentDir = filterMapOccurrences(agentDir, "skill", (occ) =>
        agentDirToActualSkill(occ, scope),
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
          Effect.map((packs) => packs.map((p) => ({ ref: p.ref, members: p.skills }))),
        ),
        packMembers: (pack: {
          readonly ref: InstalledPackRef;
          readonly members: ReadonlyArray<SkillPackMember>;
        }) => pack.members,
        packRef: (pack) => pack.ref,
        ignoredNames: ignoredPatterns,
        policy: skillPolicy(scope),
        diagnostics,
      }),
    );

    return makeProjectedSubjectCells({
      declared,
      resolved,
      actual,
      project,
    }) satisfies SkillExtensionsApi;
  });

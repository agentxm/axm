/**
 * Default no-op stubs for taxonomy getter methods added to WorkspaceContextService.
 * Spread into test mocks to satisfy the interface without implementing every method.
 *
 * @internal Test-only. Not exported from the barrel.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import type {
  WorkspaceContextService,
  ConfiguredSkill,
  ImplicitSkill,
  UnmanagedSkill,
  InstalledSkill,
  ClassifiedSkill,
  ConfiguredCommand,
  ImplicitCommand,
  UnmanagedCommand,
  InstalledCommand,
  ClassifiedCommand,
  ConfiguredExtensionRef,
  ImplicitExtensionRef,
  UnmanagedExtensionRef,
  InstalledExtensionRef,
  ClassifiedExtensionRef,
} from "@axm.sh/core/unstable/workspace";
import type { AppError } from "@axm.sh/core/unstable/app-error";
import {
  ExtensionDependencyConstraintMapSchema,
  decodeExtensionNameSync,
  type ExtensionDependencyConstraintMap,
  type ExtensionName,
  type Handle,
  normalizeHandle,
} from "@axm.sh/core/unstable/extensions";
import {
  makeRegistryExtensionPackLockEntry as buildRegistryExtensionPackLockEntry,
  type RegistryExtensionPackLockEntry,
  ResolvedExtensionMapSchema,
  type ResolvedExtensionMap,
  type SkillLockEntry,
} from "@axm.sh/core/unstable/lockfile";
import {
  decodeExactSemverVersionSync,
  decodeVersionConstraintSync,
  type ExactSemverVersion,
  type VersionConstraint,
} from "@axm.sh/core/unstable/version-constraints";
import type * as Record from "effect/Record";

type R<T> = Effect.Effect<Record.ReadonlyRecord<string, T>, AppError>;
type RA = Effect.Effect<ReadonlyArray<string>, AppError>;

const empty = <T>(): R<T> => Effect.succeed<Record.ReadonlyRecord<string, T>>({});
const emptyArr = (): RA => Effect.succeed([]);

/**
 * No-op stubs for all taxonomy getters. Spread into mock objects:
 * ```ts
 * const ws: WorkspaceContextService = {
 *   ...taxonomyStubs,
 *   // your overrides
 * };
 * ```
 */
export const taxonomyStubs = {
  getLockfileState: () => Effect.succeed("ok" as const),
  // Skill taxonomy
  getConfiguredSkills: empty<ConfiguredSkill>,
  getImplicitSkills: empty<ImplicitSkill>,
  getUnmanagedSkills: empty<UnmanagedSkill>,
  getInstalledSkills: empty<InstalledSkill>,
  getClassifiedSkills: empty<ClassifiedSkill>,
  getConfiguredExternalSkills: empty<ConfiguredSkill>,
  getUnmanagedExternalSkills: empty<UnmanagedSkill>,
  getIgnoredSkillPatterns: emptyArr,
  // Command taxonomy
  getConfiguredCommands: empty<ConfiguredCommand>,
  getImplicitCommands: empty<ImplicitCommand>,
  getUnmanagedCommands: empty<UnmanagedCommand>,
  getInstalledCommands: empty<InstalledCommand>,
  getClassifiedCommands: empty<ClassifiedCommand>,
  getConfiguredExternalCommands: empty<ConfiguredCommand>,
  getUnmanagedExternalCommands: empty<UnmanagedCommand>,
  getIgnoredCommandPatterns: emptyArr,
  // MCP Server taxonomy
  getConfiguredMcpServers: empty<ConfiguredExtensionRef>,
  getImplicitMcpServers: empty<ImplicitExtensionRef>,
  getUnmanagedMcpServers: empty<UnmanagedExtensionRef>,
  getInstalledMcpServers: empty<InstalledExtensionRef>,
  getClassifiedMcpServers: empty<ClassifiedExtensionRef>,
  getConfiguredExternalMcpServers: empty<ConfiguredExtensionRef>,
  getUnmanagedExternalMcpServers: empty<UnmanagedExtensionRef>,
  getIgnoredMcpServerPatterns: emptyArr,
  // Pack taxonomy
  getConfiguredPacks: empty<ConfiguredExtensionRef>,
  getImplicitPacks: empty<ImplicitExtensionRef>,
  getUnmanagedPacks: empty<UnmanagedExtensionRef>,
  getInstalledPacks: empty<InstalledExtensionRef>,
  getClassifiedPacks: empty<ClassifiedExtensionRef>,
  getConfiguredExternalPacks: empty<ConfiguredExtensionRef>,
  getUnmanagedExternalPacks: empty<UnmanagedExtensionRef>,
  getIgnoredPackPatterns: emptyArr,
} as const;

/**
 * Base workspace mock with no-op defaults for all methods.
 * Tests should only override the methods they exercise.
 *
 * @example
 * ```ts
 * const ws = makeBaseWorkspaceMock("/tmp/axm", {
 *   setSkill: vi.fn(() => Effect.void),
 * });
 * ```
 */
export const makeBaseWorkspaceMock = (
  axmDir = "/tmp/axm",
  overrides?: Partial<WorkspaceContextService>,
): WorkspaceContextService => {
  const baseDir = axmDir.replace(/\/\.axm$/, "") || "/tmp";
  const base = {
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir,
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredProfile: () => Effect.succeed(normalizeHandle("@community")),
    getDefaultProfile: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    getLockedSkills: () => Effect.succeed({}),
    getLockedSkill: () => Effect.succeed(Option.none()),
    getSkillDir: () =>
      Effect.succeed({
        canonicalPath: `${axmDir}/extensions/external/skills/test`,
        skillSrcPath: `${axmDir}/extensions/external/skills/test`,
      }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: () => Effect.void,
    renameSkill: () => Effect.void,
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getLockedExtensionPacks: () => Effect.succeed({}),
    getLockedExtensionPack: () => Effect.succeed(Option.none()),
    setExtensionPack: () => Effect.void,
    removeExtensionPack: () => Effect.void,
    getExtensionPackDir: () =>
      Effect.succeed({ canonicalPath: `${axmDir}/extensions/@test/packs/test` }),
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeCommandSettings: () => Effect.void,
    removeCommandLock: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removeExtensionPackSettings: () => Effect.void,
    removeExtensionPackLock: () => Effect.void,
    isExtensionRequiredByInstalledExtensionPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
  } satisfies WorkspaceContextService;
  return { ...base, ...overrides };
};

const TEST_DATE = new Date("2025-01-01T00:00:00.000Z");
const decodeResolvedExtensionMapSync = Schema.decodeUnknownSync(ResolvedExtensionMapSchema);
const decodeExtensionDependencyConstraintMapSync = Schema.decodeUnknownSync(
  ExtensionDependencyConstraintMapSchema,
);

const hasEntries = (
  value: Readonly<Record<string, unknown>> | undefined,
): value is Record<string, unknown> => value !== undefined && Object.keys(value).length > 0;

export const exactVersion = (value: string): ExactSemverVersion =>
  decodeExactSemverVersionSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const handle = (value: string): Handle => normalizeHandle(value);

export const versionConstraint = (value: string): VersionConstraint =>
  decodeVersionConstraintSync(value);

export const resolvedExtensionMap = (
  entries: Readonly<Record<string, string>>,
): ResolvedExtensionMap => decodeResolvedExtensionMapSync(entries);

export const dependencyConstraintMap = (
  entries: Readonly<Record<string, string>>,
): ExtensionDependencyConstraintMap => decodeExtensionDependencyConstraintMapSync(entries);

export interface WriteWorkspaceFilesOptions {
  readonly agents?: ReadonlyArray<string> | undefined;
  readonly profile?: string | undefined;
  readonly skills?: Record<string, unknown> | undefined;
  readonly commands?: Record<string, unknown> | undefined;
  readonly "mcp-servers"?: Record<string, unknown> | undefined;
  readonly packs?: Record<string, unknown> | undefined;
  readonly sources?: ReadonlyArray<unknown> | undefined;
  readonly lockfileSkills?: Record<string, unknown> | undefined;
  readonly lockfileCommands?: Record<string, unknown> | undefined;
  readonly lockfileMcpServers?: Record<string, unknown> | undefined;
  readonly lockfilePacks?: Record<string, unknown> | undefined;
}

export const writeWorkspaceFiles = (axmDir: string, opts: WriteWorkspaceFilesOptions = {}) => {
  fs.mkdirSync(axmDir, { recursive: true });

  const settings: Record<string, unknown> = {
    agents: [...(opts.agents ?? ["claude-code"])],
    ...(opts.profile && { profile: opts.profile }),
    ...(hasEntries(opts.skills) && { skills: opts.skills }),
    ...(hasEntries(opts.commands) && { commands: opts.commands }),
    ...(hasEntries(opts["mcp-servers"]) && { "mcp-servers": opts["mcp-servers"] }),
    ...(hasEntries(opts.packs) && { packs: opts.packs }),
    ...(opts.sources && { sources: opts.sources }),
  };

  const lockfile: Record<string, unknown> = {
    lockfileVersion: 1,
    skills: opts.lockfileSkills ?? {},
    ...(hasEntries(opts.lockfileCommands) && { commands: opts.lockfileCommands }),
    ...(hasEntries(opts.lockfileMcpServers) && { "mcp-servers": opts.lockfileMcpServers }),
    ...(hasEntries(opts.lockfilePacks) && { packs: opts.lockfilePacks }),
  };

  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

export const makeLocalSkillLockEntry = (opts?: {
  readonly path?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: Date;
  readonly updatedAt?: Date;
}): SkillLockEntry => ({
  type: "local",
  path: opts?.path ?? "/installed",
  agents: [...(opts?.agents ?? ["claude-code"])],
  installedAt: opts?.installedAt ?? TEST_DATE,
  updatedAt: opts?.updatedAt ?? TEST_DATE,
});

export const makeRegistrySkillLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly resolvedVersion?: ExactSemverVersion;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: Date;
  readonly updatedAt?: Date;
}): SkillLockEntry => ({
  type: "registry",
  owner: normalizeHandle(opts.owner),
  name: extensionName(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeExactSemverVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  agents: [...(opts.agents ?? ["claude-code"])],
  installedAt: opts.installedAt ?? TEST_DATE,
  updatedAt: opts.updatedAt ?? TEST_DATE,
});

export const makeRegistryExtensionPackLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly resolvedVersion?: ExactSemverVersion;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly resolvedSkills?: ResolvedExtensionMap;
  readonly resolvedCommands?: ResolvedExtensionMap;
  readonly resolvedMcpServers?: ResolvedExtensionMap;
  readonly installedAt?: Date;
  readonly updatedAt?: Date;
}): RegistryExtensionPackLockEntry =>
  buildRegistryExtensionPackLockEntry({
    owner: normalizeHandle(opts.owner),
    name: extensionName(opts.name),
    resolvedVersion: opts.resolvedVersion ?? decodeExactSemverVersionSync("1.0.0"),
    integrity: opts.integrity ?? "sha512-AAAA==",
    sourceName: opts.sourceName ?? "default",
    installedAt: opts.installedAt ?? TEST_DATE,
    updatedAt: opts.updatedAt ?? TEST_DATE,
    resolvedSkills: opts.resolvedSkills ?? {},
    resolvedCommands: opts.resolvedCommands ?? {},
    resolvedMcpServers: opts.resolvedMcpServers ?? {},
  });

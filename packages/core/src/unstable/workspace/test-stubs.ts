/**
 * Default no-op stubs for workspace getter methods on WorkspaceMutationsService.
 * Spread into test mocks to satisfy the interface without implementing every method.
 *
 * @internal Test-only. Not exported from the barrel.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import YAML from "yaml";
import type {
  WorkspaceMutationsService,
  ConfiguredSkill,
  UnmanagedSkill,
  InstalledSkill,
  ConfiguredCommand,
  UnmanagedCommand,
  InstalledCommand,
  ConfiguredSubagent,
  InstalledSubagent,
  ConfiguredExtensionRef,
  UnmanagedExtensionRef,
  InstalledExtensionRef,
} from "./index.js";
import type { AppError } from "../app-error/index.js";
import {
  makeRegistryPackLockEntry as buildRegistryPackLockEntry,
  type CommandLockEntry,
  type McpServerLockEntry,
  type RegistryPackLockEntry,
  type ResolvedExtensionMap,
  type SkillLockEntry,
} from "../lockfile/index.js";
import { decodeExtensionNameSync } from "../extensions/index.js";
import { type Handle } from "../extensions/handle.js";
import { decodeVersionSync, type Version } from "../version-constraints/version-constraints.js";
import type * as Record from "effect/Record";

type R<T> = Effect.Effect<Record.ReadonlyRecord<string, T>, AppError>;
type RA = Effect.Effect<ReadonlyArray<string>, AppError>;
type WorkspaceMockOverrides = Partial<WorkspaceMutationsService> &
  Partial<WorkspaceMutationsService["records"]>;

const empty = <T>(): R<T> => Effect.succeed<Record.ReadonlyRecord<string, T>>({});
const emptyArr = (): RA => Effect.succeed([]);
const fs = (() => {
  const module = process.getBuiltinModule("node:fs");
  if (!module) {
    throw new Error("node:fs builtin is unavailable");
  }
  return module;
})();
const path = (() => {
  const module = process.getBuiltinModule("node:path");
  if (!module) {
    throw new Error("node:path builtin is unavailable");
  }
  return module;
})();

/**
 * No-op stubs for all read-model record getters. Spread into mock objects:
 * ```ts
 * const ws: WorkspaceMutationsService = {
 *   records: readModelRecordStubs,
 *   // your overrides
 * };
 * ```
 */
export const readModelRecordStubs = {
  // Skill read-model records
  getConfiguredSkills: empty<ConfiguredSkill>,
  getUnmanagedSkills: empty<UnmanagedSkill>,
  getInstalledSkills: empty<InstalledSkill>,
  // Command read-model records
  getConfiguredCommands: empty<ConfiguredCommand>,
  getUnmanagedCommands: empty<UnmanagedCommand>,
  getInstalledCommands: empty<InstalledCommand>,
  // Subagent read-model records
  getConfiguredSubagents: empty<ConfiguredSubagent>,
  getInstalledSubagents: empty<InstalledSubagent>,
  // MCP Server read-model records
  getConfiguredMcpServers: empty<ConfiguredExtensionRef>,
  getUnmanagedMcpServers: empty<UnmanagedExtensionRef>,
  getInstalledMcpServers: empty<InstalledExtensionRef>,
  // Pack read-model records
  getConfiguredPacks: empty<ConfiguredExtensionRef>,
  getUnmanagedPacks: empty<UnmanagedExtensionRef>,
  getInstalledPacks: empty<InstalledExtensionRef>,
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
  overrides?: WorkspaceMockOverrides,
): WorkspaceMutationsService => {
  const baseDir = axmDir.replace(/\/\.axm$/, "") || "/tmp";
  const {
    getConfiguredSkills,
    getUnmanagedSkills,
    getInstalledSkills,
    getConfiguredCommands,
    getUnmanagedCommands,
    getInstalledCommands,
    getConfiguredSubagents,
    getInstalledSubagents,
    getConfiguredMcpServers,
    getUnmanagedMcpServers,
    getInstalledMcpServers,
    getConfiguredPacks,
    getUnmanagedPacks,
    getInstalledPacks,
    records: recordOverrides,
    ...serviceOverrides
  } = overrides ?? {};
  const records = {
    ...readModelRecordStubs,
    ...(getConfiguredSkills === undefined ? {} : { getConfiguredSkills }),
    ...(getUnmanagedSkills === undefined ? {} : { getUnmanagedSkills }),
    ...(getInstalledSkills === undefined ? {} : { getInstalledSkills }),
    ...(getConfiguredCommands === undefined ? {} : { getConfiguredCommands }),
    ...(getUnmanagedCommands === undefined ? {} : { getUnmanagedCommands }),
    ...(getInstalledCommands === undefined ? {} : { getInstalledCommands }),
    ...(getConfiguredSubagents === undefined ? {} : { getConfiguredSubagents }),
    ...(getInstalledSubagents === undefined ? {} : { getInstalledSubagents }),
    ...(getConfiguredMcpServers === undefined ? {} : { getConfiguredMcpServers }),
    ...(getUnmanagedMcpServers === undefined ? {} : { getUnmanagedMcpServers }),
    ...(getInstalledMcpServers === undefined ? {} : { getInstalledMcpServers }),
    ...(getConfiguredPacks === undefined ? {} : { getConfiguredPacks }),
    ...(getUnmanagedPacks === undefined ? {} : { getUnmanagedPacks }),
    ...(getInstalledPacks === undefined ? {} : { getInstalledPacks }),
    ...(recordOverrides ?? {}),
  };
  const base = {
    scope: "project",
    path: axmDir,
    baseDir,
    records,
    getLockfileState: () => Effect.succeed("ok" as const),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getIgnoredSkillPatterns: emptyArr,
    getIgnoredCommandPatterns: emptyArr,
    getIgnoredMcpServerPatterns: emptyArr,
    getIgnoredPackPatterns: emptyArr,
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
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    setPackEntry: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: `${axmDir}/extensions/@test/packs/test` }),
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand: () => Effect.void,
    getLockedSubagents: () => Effect.succeed({}),
    getLockedSubagent: () => Effect.succeed(Option.none()),
    setSubagent: () => Effect.void,
    setSubagentLock: () => Effect.void,
    removeSubagent: () => Effect.void,
    updateSubagentEntry: () => Effect.void,
    setSubagentEntry: () => Effect.void,
    removeSubagentSettings: () => Effect.void,
    removeSubagentLock: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeCommandSettings: () => Effect.void,
    removeCommandLock: () => Effect.void,
    updateCommandEntry: () => Effect.void,
    setCommandEntry: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
  } satisfies WorkspaceMutationsService;
  return { ...base, ...serviceOverrides };
};

const TEST_DATE = new Date("2025-01-01T00:00:00.000Z");

const hasEntries = (
  value: Readonly<Record<string, unknown>> | undefined,
): value is Record<string, unknown> => value !== undefined && Object.keys(value).length > 0;

export interface WriteWorkspaceFilesOptions {
  readonly agents?: ReadonlyArray<string> | undefined;
  readonly owner?: string | undefined;
  readonly skills?: Record<string, unknown> | undefined;
  readonly commands?: Record<string, unknown> | undefined;
  readonly "mcp-servers"?: Record<string, unknown> | undefined;
  readonly subagents?: Record<string, unknown> | undefined;
  readonly packs?: Record<string, unknown> | undefined;
  readonly sources?: ReadonlyArray<unknown> | undefined;
  readonly lockfileSkills?: Record<string, unknown> | undefined;
  readonly lockfileCommands?: Record<string, unknown> | undefined;
  readonly lockfileMcpServers?: Record<string, unknown> | undefined;
  readonly lockfileSubagents?: Record<string, unknown> | undefined;
  readonly lockfilePacks?: Record<string, unknown> | undefined;
}

export const writeWorkspaceFiles = (axmDir: string, opts: WriteWorkspaceFilesOptions = {}) => {
  const settings: Record<string, unknown> = {
    agents: [...(opts.agents ?? ["claude-code"])],
    ...(opts.owner && { owner: opts.owner }),
    ...(hasEntries(opts.skills) && { skills: opts.skills }),
    ...(hasEntries(opts.commands) && { commands: opts.commands }),
    ...(hasEntries(opts["mcp-servers"]) && { "mcp-servers": opts["mcp-servers"] }),
    ...(hasEntries(opts.subagents) && { subagents: opts.subagents }),
    ...(hasEntries(opts.packs) && { packs: opts.packs }),
    ...(opts.sources && { sources: opts.sources }),
  };

  const lockfile: Record<string, unknown> = {
    lockfileVersion: 1,
    skills: opts.lockfileSkills ?? {},
    ...(hasEntries(opts.lockfileCommands) && { commands: opts.lockfileCommands }),
    ...(hasEntries(opts.lockfileMcpServers) && { "mcp-servers": opts.lockfileMcpServers }),
    ...(hasEntries(opts.lockfileSubagents) && { subagents: opts.lockfileSubagents }),
    ...(hasEntries(opts.lockfilePacks) && { packs: opts.lockfilePacks }),
  };

  fs.mkdirSync(axmDir, { recursive: true });
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
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: Date;
  readonly updatedAt?: Date;
}): SkillLockEntry => ({
  type: "registry",
  owner: opts.owner,
  name: decodeExtensionNameSync(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  agents: [...(opts.agents ?? ["claude-code"])],
  installedAt: opts.installedAt ?? TEST_DATE,
  updatedAt: opts.updatedAt ?? TEST_DATE,
});

export const makeRegistryCommandLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly renderedFiles?: CommandLockEntry["renderedFiles"];
  readonly sourceHash?: string;
  readonly retainedByPack?: boolean;
  readonly installedAt?: Date;
  readonly updatedAt?: Date;
}): CommandLockEntry => ({
  type: "registry",
  owner: opts.owner,
  name: decodeExtensionNameSync(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  agents: [...(opts.agents ?? ["claude-code"])],
  ...(opts.renderedFiles ? { renderedFiles: opts.renderedFiles } : {}),
  ...(opts.sourceHash ? { sourceHash: opts.sourceHash } : {}),
  ...(opts.retainedByPack !== undefined ? { retainedByPack: opts.retainedByPack } : {}),
  installedAt: opts.installedAt ?? TEST_DATE,
  updatedAt: opts.updatedAt ?? TEST_DATE,
});

export const makeRegistryMcpServerLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly installedAt?: Date;
  readonly updatedAt?: Date;
  readonly retainedByPack?: boolean;
}): McpServerLockEntry => ({
  type: "registry",
  owner: opts.owner,
  name: decodeExtensionNameSync(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  ...(opts.retainedByPack !== undefined ? { retainedByPack: opts.retainedByPack } : {}),
  installedAt: opts.installedAt ?? TEST_DATE,
  updatedAt: opts.updatedAt ?? TEST_DATE,
});

export const makeRegistryPackLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly resolvedSkills?: ResolvedExtensionMap;
  readonly resolvedCommands?: ResolvedExtensionMap;
  readonly resolvedMcpServers?: ResolvedExtensionMap;
  readonly resolvedSubagents?: ResolvedExtensionMap;
  readonly installedAt?: Date;
  readonly updatedAt?: Date;
}): RegistryPackLockEntry =>
  buildRegistryPackLockEntry({
    owner: opts.owner,
    name: decodeExtensionNameSync(opts.name),
    resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
    integrity: opts.integrity ?? "sha512-AAAA==",
    sourceName: opts.sourceName ?? "default",
    installedAt: opts.installedAt ?? TEST_DATE,
    updatedAt: opts.updatedAt ?? TEST_DATE,
    resolvedSkills: opts.resolvedSkills ?? {},
    resolvedCommands: opts.resolvedCommands ?? {},
    resolvedMcpServers: opts.resolvedMcpServers ?? {},
    resolvedSubagents: opts.resolvedSubagents ?? {},
  });

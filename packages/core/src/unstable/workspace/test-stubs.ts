/**
 * Default no-op stubs for workspace getter methods on WorkspaceMutationsService.
 * Spread into test mocks to satisfy the interface without implementing every method.
 *
 * @internal Test-only. Not exported from the barrel.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import YAML from "yaml";
import type {
  WorkspaceMutationsService,
  WorkspaceTransactionRunner,
  ReadModelRecordRow,
  PackagingKind,
} from "./index.js";
import type { AppError } from "../app-error/index.js";
import type { ExtensionInventory } from "./read-model/extensions/inventory.js";
import {
  makeRegistryPackLockEntry as buildRegistryPackLockEntry,
  type McpServerLockEntry,
  type RegistryPackLockEntry,
  type ResolvedExtensionMap,
  type RuleLockEntry,
  type SkillLockEntry,
} from "../lockfile/index.js";
import {
  decodeExtensionNameSync,
  extensionTypes,
  parseRegistrySourcePatternParts,
  toExtensionTypePlural,
  type ExtensionType,
  type InstallableExtensionType,
} from "../extensions/index.js";
import { trustRecordKey, type TrustAuthority } from "../trust/index.js";
import { type Handle } from "../extensions/handle.js";
import { decodeRelativePathSync } from "../utils/path-types.js";
import { decodeVersionSync, type Version } from "../version-constraints/version-constraints.js";

type WorkspaceMockOverrides = Partial<WorkspaceMutationsService> &
  Partial<WorkspaceMutationsService["records"]>;

const emptyRows = (): Effect.Effect<ReadonlyArray<ReadModelRecordRow>, AppError> =>
  Effect.succeed([]);
const emptyInventory = (): Effect.Effect<ExtensionInventory, AppError> =>
  Effect.succeed({
    items: [],
    count: 0,
    configuredCount: 0,
    implicitCount: 0,
    installedCount: 0,
    unmanagedCount: 0,
  });
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
 * Build a `configured` read-model row. Tests that previously stubbed
 * `getConfiguredSkills` with a `{ name: { source, enabled } }` map supply the
 * same facts here and feed the result to {@link rowsFor}.
 */
export const configuredRow = (args: {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly source: string;
  readonly enabled?: boolean;
  readonly packagingKind?: PackagingKind;
}): ReadModelRecordRow => ({
  type: args.type,
  name: args.name,
  source: args.source,
  enabled: args.enabled ?? true,
  packagingKind: args.packagingKind ?? "native",
  lifecycle: "configured",
});

/** Build an `implicit` read-model row (pack member or lockfile-only entry). */
export const implicitRow = (args: {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly source?: string;
  readonly packagingKind?: PackagingKind;
}): ReadModelRecordRow => ({
  type: args.type,
  name: args.name,
  source: Option.fromUndefinedOr(args.source),
  enabled: true,
  packagingKind: args.packagingKind ?? "native",
  lifecycle: "implicit",
});

/** Build an `unmanaged` read-model row (observed on disk, unclaimed). */
export const unmanagedRow = (args: {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly locations?: ReadonlyArray<string>;
  readonly packagingKind?: PackagingKind;
}): ReadModelRecordRow => ({
  type: args.type,
  name: args.name,
  source: Option.none(),
  enabled: true,
  packagingKind: args.packagingKind ?? "non-native",
  locations: args.locations ?? [],
  agents: [],
  ownershipEvidence: [],
  lifecycle: "unmanaged",
});

/**
 * Build a `records.rows` stub from per-type row lists. Types absent from the
 * map yield an empty array, matching the real reader's totality.
 */
export const rowsFor =
  (byType: Partial<Record<InstallableExtensionType, ReadonlyArray<ReadModelRecordRow>>>) =>
  (type: InstallableExtensionType): Effect.Effect<ReadonlyArray<ReadModelRecordRow>, AppError> =>
    Effect.succeed(byType[type] ?? []);

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
  getExtensionInventory: emptyInventory,
  rows: emptyRows,
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
  const { rows, records: recordOverrides, ...serviceOverrides } = overrides ?? {};
  const records = {
    ...readModelRecordStubs,
    ...(rows === undefined ? {} : { rows }),
    ...(recordOverrides ?? {}),
  };
  const emptyLocked = (): Effect.Effect<Readonly<Record<string, unknown>>, AppError> =>
    Effect.succeed({});
  const lockedForType = (
    type: ExtensionType,
  ): Effect.Effect<Readonly<Record<string, unknown>>, AppError> => {
    switch (type) {
      case "skill":
        return (serviceOverrides.getLockedSkills ?? emptyLocked)().pipe(
          Effect.map((entries): Readonly<Record<string, unknown>> => entries),
        );
      case "mcp-server":
        return (serviceOverrides.getLockedMcpServers ?? emptyLocked)().pipe(
          Effect.map((entries): Readonly<Record<string, unknown>> => entries),
        );
      case "subagent":
        return (serviceOverrides.getLockedSubagents ?? emptyLocked)().pipe(
          Effect.map((entries): Readonly<Record<string, unknown>> => entries),
        );
      case "pack":
        return (serviceOverrides.getLockedPacks ?? emptyLocked)().pipe(
          Effect.map((entries): Readonly<Record<string, unknown>> => entries),
        );
      case "rule":
        return (serviceOverrides.getLockedRules ?? emptyLocked)().pipe(
          Effect.map((entries): Readonly<Record<string, unknown>> => entries),
        );
      case "hook":
        return (serviceOverrides.getLockedHooks ?? emptyLocked)().pipe(
          Effect.map((entries): Readonly<Record<string, unknown>> => entries),
        );
      case "knowledge":
        return (serviceOverrides.getLockedKnowledge ?? emptyLocked)().pipe(
          Effect.map((entries): Readonly<Record<string, unknown>> => entries),
        );
    }
  };
  const configuredForType = (
    type: ExtensionType,
  ): Effect.Effect<Readonly<Record<string, unknown>>, AppError> => {
    const normalize = <A>(
      effect: Effect.Effect<Readonly<Record<string, A>>, AppError>,
    ): Effect.Effect<Readonly<Record<string, unknown>>, AppError> =>
      effect.pipe(Effect.map((entries): Readonly<Record<string, unknown>> => entries));
    switch (type) {
      case "skill":
        return normalize((serviceOverrides.getConfiguredSkillEntries ?? emptyLocked)());
      case "mcp-server":
        return normalize((serviceOverrides.getConfiguredMcpServerEntries ?? emptyLocked)());
      case "subagent":
        return normalize((serviceOverrides.getConfiguredSubagentEntries ?? emptyLocked)());
      case "pack":
        return normalize((serviceOverrides.getConfiguredPackEntries ?? emptyLocked)());
      case "rule":
        return normalize((serviceOverrides.getConfiguredRuleEntries ?? emptyLocked)());
      case "hook":
        return normalize((serviceOverrides.getConfiguredHookEntries ?? emptyLocked)());
      case "knowledge":
        return normalize((serviceOverrides.getConfiguredKnowledgeEntries ?? emptyLocked)());
    }
  };
  const sourceOf = (row: ReadModelRecordRow): string | undefined =>
    row.lifecycle === "configured" ? row.source : Option.getOrUndefined(row.source);
  interface DesiredTestEntry {
    readonly name: string;
    readonly source: string;
    readonly enabled: boolean;
  }
  const desiredEntriesForType = (type: ExtensionType) =>
    Effect.all({
      rows: records.rows(type),
      configured: configuredForType(type),
    }).pipe(
      Effect.map(({ rows, configured }) => {
        const entries = new Map<string, DesiredTestEntry>();
        for (const row of rows) {
          const source = sourceOf(row);
          if (source === undefined || row.lifecycle === "unmanaged") continue;
          entries.set(row.name, { name: row.name, source, enabled: row.enabled });
        }
        for (const [name, value] of Object.entries(configured)) {
          if (
            entries.has(name) ||
            typeof value !== "object" ||
            value === null ||
            !("source" in value) ||
            typeof value.source !== "string"
          ) {
            continue;
          }
          entries.set(name, {
            name,
            source: value.source,
            enabled: !("enabled" in value) || typeof value.enabled !== "boolean" || value.enabled,
          });
        }
        return [...entries.values()];
      }),
    );
  const authorityOf = (value: string): TrustAuthority | undefined => {
    switch (value) {
      case "registry":
      case "github":
      case "gitlab":
      case "bitbucket":
      case "azurerepos":
      case "git":
      case "local":
      case "workspace":
      case "inline":
        return value;
      default:
        return undefined;
    }
  };
  const getSynthesizedDesiredStateGraph = () =>
    Effect.gen(function* () {
      const rowsByType = yield* Effect.forEach(extensionTypes, (type) =>
        desiredEntriesForType(type).pipe(Effect.map((entries) => ({ type, entries }))),
      );
      const nodes = rowsByType.flatMap(({ type, entries }) =>
        entries.map((entry) => {
          const source = entry.source;
          const parsed = parseRegistrySourcePatternParts(source);
          const identity =
            parsed === undefined ? source : `${parsed.owner}/${parsed.type}/${parsed.name}`;
          return {
            type,
            name: entry.name,
            identity,
            source,
            enabled: entry.enabled,
            constraints: parsed?.versionRange === undefined ? [] : [parsed.versionRange],
            origins: [
              {
                type: "settings" as const,
                source,
                enabled: entry.enabled,
              },
            ],
          };
        }),
      );
      return { complete: true, nodes, problems: [] };
    });
  const getSynthesizedTrustState = () =>
    Effect.gen(function* () {
      const entries = yield* Effect.forEach(extensionTypes, (type) =>
        Effect.all({
          type: Effect.succeed(type),
          desired: desiredEntriesForType(type),
          locked: lockedForType(type),
        }),
      );
      const trustRecords: Record<
        string,
        {
          readonly extensionType: ExtensionType;
          readonly name: string;
          readonly authority: TrustAuthority;
          readonly sourceIdentity: string;
          readonly sourceName?: string;
          readonly resolvedVersion?: string;
          readonly immutableRevision?: string;
          readonly publisherBindingId?: string;
          readonly integrity?: string;
          readonly contentIdentity?: string;
        }
      > = {};
      for (const { type, desired, locked } of entries) {
        for (const entry of desired) {
          const lock = locked[entry.name];
          const source = entry.source;
          if (
            source === undefined ||
            typeof lock !== "object" ||
            lock === null ||
            !("type" in lock) ||
            typeof lock.type !== "string"
          ) {
            continue;
          }
          const authority = authorityOf(lock.type);
          if (authority === undefined) continue;
          const parsed = parseRegistrySourcePatternParts(source);
          const sourceIdentity =
            authority === "registry" && parsed !== undefined
              ? `${parsed.owner}/${toExtensionTypePlural(type)}/${parsed.name}`
              : source;
          const resolvedVersion =
            "resolvedVersion" in lock && typeof lock.resolvedVersion === "string"
              ? lock.resolvedVersion
              : "version" in lock && typeof lock.version === "string"
                ? lock.version
                : undefined;
          const immutableRevision =
            "gitTreeHash" in lock && typeof lock.gitTreeHash === "string"
              ? lock.gitTreeHash
              : undefined;
          const publisherBindingId =
            "publisherBindingId" in lock && typeof lock.publisherBindingId === "string"
              ? lock.publisherBindingId
              : undefined;
          const integrity =
            "integrity" in lock && typeof lock.integrity === "string" ? lock.integrity : undefined;
          const sourceName =
            "sourceName" in lock && typeof lock.sourceName === "string"
              ? lock.sourceName
              : undefined;
          trustRecords[trustRecordKey(type, entry.name)] = {
            extensionType: type,
            name: entry.name,
            authority,
            sourceIdentity,
            ...(sourceName === undefined ? {} : { sourceName }),
            ...(resolvedVersion === undefined ? {} : { resolvedVersion }),
            ...(immutableRevision === undefined ? {} : { immutableRevision }),
            ...(publisherBindingId === undefined ? {} : { publisherBindingId }),
            ...(integrity === undefined ? {} : { integrity }),
          };
        }
      }
      return { trustStateVersion: 1 as const, records: trustRecords };
    });
  const runTransaction: WorkspaceTransactionRunner = (args) =>
    Effect.gen(function* () {
      const value = yield* args.transition;
      yield* args.validate(value);
      if (args.receipt !== undefined) {
        yield* args.receipt(value);
      }
      return value;
    });
  const base = {
    scope: "project",
    path: axmDir,
    baseDir,
    records,
    runTransaction,
    getLockfileState: () => Effect.succeed("ok" as const),
    getDesiredStateGraph: getSynthesizedDesiredStateGraph,
    getTrustState: getSynthesizedTrustState,
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.none()),
    getMinimumReleaseAge: () => Effect.succeed("24h"),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkillEntries: () => Effect.succeed({}),
    getConfiguredRuleEntries: () => Effect.succeed({}),
    getConfiguredHookEntries: () => Effect.succeed({}),
    getLockedRules: () => Effect.succeed({}),
    getLockedRuleEntry: () => Effect.succeed(Option.none<RuleLockEntry>()),
    setRule: () => Effect.void,
    setRuleLock: () => Effect.void,
    removeRule: () => Effect.void,
    removeRuleSettings: () => Effect.void,
    removeRuleLock: () => Effect.void,
    updateRuleEntry: () => Effect.void,
    setRuleEntry: () => Effect.void,
    getLockedHooks: () => Effect.succeed({}),
    getLockedHookEntry: () => Effect.succeed(Option.none()),
    setHook: () => Effect.void,
    setHookLock: () => Effect.void,
    removeHook: () => Effect.void,
    removeHookSettings: () => Effect.void,
    removeHookLock: () => Effect.void,
    updateHookEntry: () => Effect.void,
    setHookEntry: () => Effect.void,
    getConfiguredKnowledgeEntries: () => Effect.succeed({}),
    getKnowledgeDiscoveryConfig: () => Effect.succeed({ instructions: true }),
    getLockedKnowledge: () => Effect.succeed({}),
    getLockedKnowledgeEntry: () => Effect.succeed(Option.none()),
    setKnowledge: () => Effect.void,
    setKnowledgeLock: () => Effect.void,
    removeKnowledge: () => Effect.void,
    removeKnowledgeSettings: () => Effect.void,
    removeKnowledgeLock: () => Effect.void,
    updateKnowledgeEntry: () => Effect.void,
    setKnowledgeEntry: () => Effect.void,
    getConfiguredPackEntries: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    getInstructionsConfig: () => Effect.succeed(Option.none()),
    setInstructionsConfig: () => Effect.void,
    getConfiguredMcpServerEntries: () => Effect.succeed({}),
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
    addConfiguredAgent: () => Effect.void,
    removeConfiguredAgent: () => Effect.void,
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    setPackLock: () => Effect.void,
    refreshPackContentIdentity: () => Effect.void,
    setPackEntry: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: `${axmDir}/extensions/@test/packs/test` }),
    getLockedSubagents: () => Effect.succeed({}),
    getLockedSubagent: () => Effect.succeed(Option.none()),
    getConfiguredSubagentEntries: () => Effect.succeed({}),
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
    updateMcpServerEntry: () => Effect.void,
    setMcpServerEntry: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    removeTrustRecord: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
  } satisfies WorkspaceMutationsService;
  return { ...base, ...serviceOverrides };
};

const TEST_DATE = DateTime.makeUnsafe("2025-01-01T00:00:00.000Z");

const hasEntries = (
  value: Readonly<Record<string, unknown>> | undefined,
): value is Record<string, unknown> => value !== undefined && Object.keys(value).length > 0;

export interface WriteWorkspaceFilesOptions {
  readonly agents?: ReadonlyArray<string> | undefined;
  readonly owner?: string | undefined;
  readonly skills?: Record<string, unknown> | undefined;
  readonly mcps?: Record<string, unknown> | undefined;
  readonly subagents?: Record<string, unknown> | undefined;
  readonly rules?: Record<string, unknown> | undefined;
  readonly packs?: Record<string, unknown> | undefined;
  readonly sources?: ReadonlyArray<unknown> | undefined;
  readonly lockfileSkills?: Record<string, unknown> | undefined;
  readonly lockfileMcpServers?: Record<string, unknown> | undefined;
  readonly lockfileSubagents?: Record<string, unknown> | undefined;
  readonly lockfileRules?: Record<string, unknown> | undefined;
  readonly lockfilePacks?: Record<string, unknown> | undefined;
}

export const writeWorkspaceFiles = (axmDir: string, opts: WriteWorkspaceFilesOptions = {}) => {
  const settings: Record<string, unknown> = {
    agents: [...(opts.agents ?? ["claude-code"])],
    ...(opts.owner && { owner: opts.owner }),
    ...(hasEntries(opts.skills) && { skills: opts.skills }),
    ...(hasEntries(opts["mcps"]) && { mcps: opts["mcps"] }),
    ...(hasEntries(opts.subagents) && { subagents: opts.subagents }),
    ...(hasEntries(opts.rules) && { rules: opts.rules }),
    ...(hasEntries(opts.packs) && { packs: opts.packs }),
    ...(opts.sources && { sources: opts.sources }),
  };

  const lockfile: Record<string, unknown> = {
    lockfileVersion: 3,
    skills: opts.lockfileSkills ?? {},
    ...(hasEntries(opts.lockfileMcpServers) && { mcps: opts.lockfileMcpServers }),
    ...(hasEntries(opts.lockfileSubagents) && { subagents: opts.lockfileSubagents }),
    ...(hasEntries(opts.lockfileRules) && { rules: opts.lockfileRules }),
    ...(hasEntries(opts.lockfilePacks) && { packs: opts.lockfilePacks }),
  };

  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

export const makeLocalSkillLockEntry = (opts?: {
  readonly path?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: DateTime.Utc;
  readonly updatedAt?: DateTime.Utc;
}): SkillLockEntry => ({
  type: "local",
  path: decodeRelativePathSync(opts?.path ?? "installed"),
  installedAt: opts?.installedAt ?? TEST_DATE,
  updatedAt: opts?.updatedAt ?? TEST_DATE,
});

export const makeRegistrySkillLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly publisherBindingId?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: DateTime.Utc;
  readonly updatedAt?: DateTime.Utc;
}): SkillLockEntry => ({
  type: "registry",
  owner: opts.owner,
  name: decodeExtensionNameSync(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
  installedAt: opts.installedAt ?? TEST_DATE,
  updatedAt: opts.updatedAt ?? TEST_DATE,
});

export const makeRegistryMcpServerLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly publisherBindingId?: string;
  readonly installedAt?: DateTime.Utc;
  readonly updatedAt?: DateTime.Utc;
  readonly retainedByPack?: boolean;
}): McpServerLockEntry => ({
  type: "registry",
  owner: opts.owner,
  name: decodeExtensionNameSync(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
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
  readonly publisherBindingId?: string;
  readonly sourceHash?: RegistryPackLockEntry["sourceHash"];
  readonly resolvedSkills?: ResolvedExtensionMap;
  readonly resolvedMcpServers?: ResolvedExtensionMap;
  readonly resolvedSubagents?: ResolvedExtensionMap;
  readonly installedAt?: DateTime.Utc;
  readonly updatedAt?: DateTime.Utc;
}): RegistryPackLockEntry =>
  buildRegistryPackLockEntry({
    owner: opts.owner,
    name: decodeExtensionNameSync(opts.name),
    resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
    integrity: opts.integrity ?? "sha512-AAAA==",
    sourceName: opts.sourceName ?? "default",
    publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
    ...(opts.sourceHash === undefined ? {} : { sourceHash: opts.sourceHash }),
    installedAt: opts.installedAt ?? TEST_DATE,
    updatedAt: opts.updatedAt ?? TEST_DATE,
    resolvedSkills: opts.resolvedSkills ?? {},
    resolvedMcpServers: opts.resolvedMcpServers ?? {},
    resolvedSubagents: opts.resolvedSubagents ?? {},
  });

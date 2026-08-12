/**
 * Default no-op stubs for workspace getter methods on WorkspaceMutationsService.
 * Spread into test mocks to satisfy the interface without implementing every method.
 *
 * @internal Test-only. Not exported from the barrel.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import type {
  WorkspaceMutationsService,
  WorkspaceTransactionRunner,
  ExtensionInventory,
  PackagingKind,
  ReadModelRecordRow,
} from "@agentxm/client-core/unstable/workspace";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import {
  ExtensionDependencyConstraintMapSchema,
  decodeExtensionNameSync,
  type ExtensionDependencyConstraintMap,
  type ExtensionName,
  type Handle,
  type InstallableExtensionType,
  normalizeHandle,
} from "@agentxm/client-core/unstable/extensions";
import {
  makeRegistryPackLockEntry as buildRegistryPackLockEntry,
  LockfileSchema,
  type HookLockEntry,
  type RegistryPackLockEntry,
  ResolvedExtensionMapSchema,
  type ResolvedExtensionMap,
  type RuleLockEntry,
  type SkillLockEntry,
} from "@agentxm/client-core/unstable/lockfile";
import { computeSourceHash } from "@agentxm/client-core/unstable/extensions";
import { trustStateFromLockfile } from "@agentxm/client-core/unstable/trust";
import {
  decodeVersionSync,
  decodeVersionRangeSync,
  type Version,
  type VersionRange,
} from "@agentxm/client-core/unstable/version-constraints";
import { decodeRelativePathSync } from "@agentxm/client-core/unstable/utils";

type WorkspaceMockOverrides = Partial<WorkspaceMutationsService> &
  Partial<WorkspaceMutationsService["records"]>;

export const runWorkspaceTransactionStub: WorkspaceTransactionRunner = (args) =>
  Effect.gen(function* () {
    const value = yield* args.transition;
    yield* args.validate(value);
    if (args.receipt !== undefined) {
      yield* args.receipt(value);
    }
    return value;
  });

export const managerLifecycleStubs = {
  runTransaction: runWorkspaceTransactionStub,
  materializeDeactivate: () => Effect.void,
  upsertTrustEntry: () => Effect.void,
  removeTrustEntry: () => Effect.void,
};

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
const crypto = (() => {
  const module = process.getBuiltinModule("node:crypto");
  if (!module) {
    throw new Error("node:crypto builtin is unavailable");
  }
  return module;
})();

/** Build a `configured` read-model row for `records.rows` stubs. */
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
  getInventory: () =>
    Effect.succeed({
      items: [],
      count: 0,
      configuredCount: 0,
      implicitCount: 0,
      installedCount: 0,
      unmanagedCount: 0,
    }),
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
  const base = {
    scope: "project",
    path: axmDir,
    baseDir,
    records,
    runTransaction: runWorkspaceTransactionStub,
    getLockfileState: () => Effect.succeed("ok" as const),
    getDesiredStateGraph: () =>
      Effect.succeed({
        complete: true,
        nodes: [],
        problems: [],
      }),
    getTrustState: () =>
      Effect.succeed({
        trustStateVersion: 1,
        records: {},
      }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.none()),
    getMinimumReleaseAge: () => Effect.succeed("24h"),
    getMinimumReleaseAgeExclude: () => Effect.succeed([]),
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
    getLockedHookEntry: () => Effect.succeed(Option.none<HookLockEntry>()),
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
    refreshAuthoredContentIdentity: () => Effect.void,
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
    getConfiguredMcpServerEntries: () => Effect.succeed({}),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    updateMcpServerEntry: () => Effect.void,
    setMcpServerEntry: () => Effect.void,
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
const decodeResolvedExtensionMapSync = Schema.decodeUnknownSync(ResolvedExtensionMapSchema);
const decodeExtensionDependencyConstraintMapSync = Schema.decodeUnknownSync(
  ExtensionDependencyConstraintMapSchema,
);

const hasEntries = (
  value: Readonly<Record<string, unknown>> | undefined,
): value is Record<string, unknown> => value !== undefined && Object.keys(value).length > 0;

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const handle = (value: string): Handle => normalizeHandle(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const resolvedExtensionMap = (
  entries: Readonly<Record<string, string>>,
): ResolvedExtensionMap =>
  decodeResolvedExtensionMapSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, version]) => [
        name,
        {
          source: "registry",
          version,
          publisherBindingId: "hbnd_test",
          integrity: "sha512-member",
        },
      ]),
    ),
  );

export const dependencyConstraintMap = (
  entries: Readonly<Record<string, string>>,
): ExtensionDependencyConstraintMap => decodeExtensionDependencyConstraintMapSync(entries);

export interface WriteWorkspaceFilesOptions {
  readonly agents?: ReadonlyArray<string> | undefined;
  readonly owner?: string | undefined;
  readonly skills?: Record<string, unknown> | undefined;
  readonly rules?: Record<string, unknown> | undefined;
  readonly hooks?: Record<string, unknown> | undefined;
  readonly knowledge?: Record<string, unknown> | undefined;
  readonly mcps?: Record<string, unknown> | undefined;
  readonly packs?: Record<string, unknown> | undefined;
  readonly sources?: ReadonlyArray<unknown> | undefined;
  readonly minimumReleaseAge?: string | undefined;
  readonly minimumReleaseAgeExclude?: ReadonlyArray<string> | undefined;
  readonly lockfileSkills?: Record<string, unknown> | undefined;
  readonly lockfileRules?: Record<string, unknown> | undefined;
  readonly lockfileHooks?: Record<string, unknown> | undefined;
  readonly lockfileKnowledge?: Record<string, unknown> | undefined;
  readonly lockfileMcpServers?: Record<string, unknown> | undefined;
  readonly lockfilePacks?: Record<string, unknown> | undefined;
  readonly subagents?: Record<string, unknown> | undefined;
  readonly lockfileSubagents?: Record<string, unknown> | undefined;
  readonly writeTrustFromLockfile?: boolean | undefined;
}

export const writeWorkspaceFiles = (axmDir: string, opts: WriteWorkspaceFilesOptions = {}) => {
  const settings: Record<string, unknown> = {
    agents: [...(opts.agents ?? ["claude-code"])],
    ...(opts.owner && { owner: opts.owner }),
    ...(hasEntries(opts.skills) && { skills: opts.skills }),
    ...(hasEntries(opts.rules) && { rules: opts.rules }),
    ...(hasEntries(opts.hooks) && { hooks: opts.hooks }),
    ...(hasEntries(opts.knowledge) && { knowledge: opts.knowledge }),
    ...(hasEntries(opts.subagents) && { subagents: opts.subagents }),
    ...(hasEntries(opts.mcps) && { mcpServers: opts.mcps }),
    ...(hasEntries(opts.packs) && { packs: opts.packs }),
    ...(opts.sources && { sources: opts.sources }),
    ...(opts.minimumReleaseAge && { minimumReleaseAge: opts.minimumReleaseAge }),
    ...(opts.minimumReleaseAgeExclude && {
      minimumReleaseAgeExclude: opts.minimumReleaseAgeExclude,
    }),
  };

  const lockfile: Record<string, unknown> = {
    lockfileVersion: 3,
    skills: opts.lockfileSkills ?? {},
    ...(hasEntries(opts.lockfileRules) && { rules: opts.lockfileRules }),
    ...(hasEntries(opts.lockfileHooks) && { hooks: opts.lockfileHooks }),
    ...(hasEntries(opts.lockfileKnowledge) && { knowledge: opts.lockfileKnowledge }),
    ...(hasEntries(opts.lockfileSubagents) && { subagents: opts.lockfileSubagents }),
    ...(hasEntries(opts.lockfileMcpServers) && { mcpServers: opts.lockfileMcpServers }),
    ...(hasEntries(opts.lockfilePacks) && { packs: opts.lockfilePacks }),
  };

  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
  if (opts.writeTrustFromLockfile === true) {
    const decoded = Schema.decodeUnknownSync(LockfileSchema)(lockfile);
    fs.writeFileSync(
      path.join(axmDir, "trust.json"),
      JSON.stringify(trustStateFromLockfile(decoded), null, 2),
    );
  }
};

export const computePackageContentHashSync = (packageDir: string): string => {
  const files: Array<{ readonly absolutePath: string; readonly relativePath: string }> = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: path.relative(packageDir, absolutePath),
        });
      }
    }
  };
  visit(packageDir);
  files.sort((left, right) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
  );
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(file.absolutePath));
    hash.update("\0");
  }
  return computeSourceHash(hash.digest("hex"));
};

export const writeTrustFromWorkspaceLockfile = (axmDir: string): void => {
  const lockfile = Schema.decodeUnknownSync(LockfileSchema)(
    YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")),
  );
  fs.writeFileSync(
    path.join(axmDir, "trust.json"),
    JSON.stringify(trustStateFromLockfile(lockfile), null, 2),
  );
};

/**
 * Write a workspace-sourced OKF knowledge package under `<axmDir>/extensions`,
 * resolvable as `workspace:@acme/knowledge/<name>`.
 */
export const writeKnowledgeExtension = (axmDir: string, name: string): void => {
  const root = path.join(axmDir, "extensions", "@acme", "knowledge", name);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "knowledge.json"),
    JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name,
      version: "1.0.0",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Knowledge\n',
  );
};

export const ensureWorkspaceFiles = (axmDir: string): void => {
  if (!fs.existsSync(path.join(axmDir, "settings.json"))) {
    writeWorkspaceFiles(axmDir);
  }
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
  readonly name: ExtensionName;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly publisherBindingId?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: DateTime.Utc;
  readonly updatedAt?: DateTime.Utc;
}): SkillLockEntry => ({
  type: "registry",
  owner: normalizeHandle(opts.owner),
  name: extensionName(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
  installedAt: opts.installedAt ?? TEST_DATE,
  updatedAt: opts.updatedAt ?? TEST_DATE,
});

export const makeRegistryPackLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly publisherBindingId?: string;
  readonly resolvedSkills?: ResolvedExtensionMap;
  readonly resolvedMcpServers?: ResolvedExtensionMap;
  readonly resolvedSubagents?: ResolvedExtensionMap;
  readonly installedAt?: DateTime.Utc;
  readonly updatedAt?: DateTime.Utc;
}): RegistryPackLockEntry =>
  buildRegistryPackLockEntry({
    owner: normalizeHandle(opts.owner),
    name: extensionName(opts.name),
    resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
    integrity: opts.integrity ?? "sha512-AAAA==",
    sourceName: opts.sourceName ?? "default",
    publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
    installedAt: opts.installedAt ?? TEST_DATE,
    updatedAt: opts.updatedAt ?? TEST_DATE,
    resolvedSkills: opts.resolvedSkills ?? {},
    resolvedMcpServers: opts.resolvedMcpServers ?? {},
    resolvedSubagents: opts.resolvedSubagents ?? {},
  });

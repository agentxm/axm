/**
 * Default no-op stubs for workspace getter methods on WorkspaceMutationsService.
 * Spread into test mocks to satisfy the interface without implementing every method.
 *
 * @internal Test-only. Not exported from the barrel.
 */

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
  CANONICAL_MATERIALIZATION_MARKER_FILENAME,
  ExtensionDependencyConstraintMapSchema,
  SourceHashSchema,
  decodeExtensionNameSync,
  type ExtensionDependencyConstraintMap,
  type ExtensionName,
  type Handle,
  type InstallableExtensionType,
  normalizeHandle,
} from "@agentxm/client-core/unstable/extensions";
import {
  makeRegistryPackLockEntry as buildRegistryPackLockEntry,
  type HookLockEntry,
  type RegistryPackLockEntry,
  type RuleLockEntry,
  type SkillLockEntry,
} from "@agentxm/client-core/unstable/lockfile";
import { computeSourceHash } from "@agentxm/client-core/unstable/extensions";
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
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.none()),
    getPublishDefaultVisibility: () => Effect.succeed(Option.none()),
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
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
  } satisfies WorkspaceMutationsService;
  return { ...base, ...serviceOverrides };
};

const TEST_CONTENT_IDENTITY = Schema.decodeUnknownSync(SourceHashSchema)("test-content");
const decodeExtensionDependencyConstraintMapSync = Schema.decodeUnknownSync(
  ExtensionDependencyConstraintMapSchema,
);

const hasEntries = (
  value: Readonly<Record<string, unknown>> | undefined,
): value is Record<string, unknown> => value !== undefined && Object.keys(value).length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Accept the concise pre-v4 fixture shapes still useful to command tests, but
 * publish only valid v4 accepted resolutions to the workspace under test.
 * Authored workspace packages deliberately have no lock row.
 */
const normalizeTestLockMap = (
  entries: Record<string, unknown> | undefined,
  feature: "extension" | "pack" = "extension",
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(entries ?? {}).flatMap(([name, value]) => {
      if (!isRecord(value) || value["type"] === "workspace") return [];
      const type = value["type"];
      if (type === "registry") {
        return [
          [
            name,
            {
              type,
              owner: value["owner"],
              name: value["name"],
              resolvedVersion: value["resolvedVersion"],
              integrity: value["integrity"],
              sourceName: value["sourceName"],
              publisherBindingId: value["publisherBindingId"],
              ...(feature === "pack"
                ? {
                    manifestContentIdentity:
                      value["manifestContentIdentity"] ??
                      value["sourceHash"] ??
                      TEST_CONTENT_IDENTITY,
                  }
                : {}),
            },
          ],
        ];
      }
      if (type === "local") {
        return [
          [
            name,
            {
              type,
              path: value["path"],
              contentIdentity:
                value["contentIdentity"] ?? value["sourceHash"] ?? TEST_CONTENT_IDENTITY,
            },
          ],
        ];
      }
      if (
        type === "github" ||
        type === "gitlab" ||
        type === "bitbucket" ||
        type === "azurerepos" ||
        type === "git"
      ) {
        const immutableRevision = value["gitTreeHash"] ?? "test-revision";
        return [
          [
            name,
            {
              type,
              ...(type === "azurerepos"
                ? {
                    organization: value["organization"],
                    project: value["project"],
                    repo: value["repo"],
                  }
                : type === "git"
                  ? { url: value["url"] }
                  : { owner: value["owner"], repo: value["repo"] }),
              ...(value["ref"] === undefined ? {} : { ref: value["ref"] }),
              ...(value["path"] === undefined ? {} : { path: value["path"] }),
              resolvedCommit: value["resolvedCommit"] ?? immutableRevision,
              resolvedTree: value["resolvedTree"] ?? immutableRevision,
              contentIdentity:
                value["contentIdentity"] ?? value["sourceHash"] ?? TEST_CONTENT_IDENTITY,
            },
          ],
        ];
      }
      return [[name, value]];
    }),
  );

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const handle = (value: string): Handle => normalizeHandle(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

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
  const registrySourceNames = new Set(
    [
      opts.lockfileSkills,
      opts.lockfileRules,
      opts.lockfileHooks,
      opts.lockfileKnowledge,
      opts.lockfileSubagents,
      opts.lockfileMcpServers,
      opts.lockfilePacks,
    ].flatMap((entries) =>
      Object.values(entries ?? {}).flatMap((entry) =>
        isRecord(entry) && entry["type"] === "registry" && typeof entry["sourceName"] === "string"
          ? [entry["sourceName"]]
          : [],
      ),
    ),
  );
  const sources =
    opts.sources ??
    (registrySourceNames.size > 0
      ? [...registrySourceNames].map((name) => ({
          type: "registry",
          name,
          location: "file:///tmp/test-registry",
        }))
      : undefined);
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
    ...(sources && { sources }),
    ...(opts.minimumReleaseAge && { minimumReleaseAge: opts.minimumReleaseAge }),
    ...(opts.minimumReleaseAgeExclude && {
      minimumReleaseAgeExclude: opts.minimumReleaseAgeExclude,
    }),
  };

  const lockfile: Record<string, unknown> = {
    lockfileVersion: 4,
    skills: normalizeTestLockMap(opts.lockfileSkills),
    ...(hasEntries(opts.lockfileRules) && { rules: normalizeTestLockMap(opts.lockfileRules) }),
    ...(hasEntries(opts.lockfileHooks) && { hooks: normalizeTestLockMap(opts.lockfileHooks) }),
    ...(hasEntries(opts.lockfileKnowledge) && {
      knowledge: normalizeTestLockMap(opts.lockfileKnowledge),
    }),
    ...(hasEntries(opts.lockfileSubagents) && {
      subagents: normalizeTestLockMap(opts.lockfileSubagents),
    }),
    ...(hasEntries(opts.lockfileMcpServers) && {
      mcpServers: normalizeTestLockMap(opts.lockfileMcpServers),
    }),
    ...(hasEntries(opts.lockfilePacks) && {
      packs: normalizeTestLockMap(opts.lockfilePacks, "pack"),
    }),
  };

  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

export const computePackageContentHashSync = (packageDir: string): string => {
  const files: Array<{ readonly absolutePath: string; readonly relativePath: string }> = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === CANONICAL_MATERIALIZATION_MARKER_FILENAME) continue;
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
  readonly installedAt?: unknown;
  readonly updatedAt?: unknown;
}): SkillLockEntry => ({
  type: "local",
  path: decodeRelativePathSync(opts?.path ?? "installed"),
  contentIdentity: TEST_CONTENT_IDENTITY,
});

export const makeRegistrySkillLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly publisherBindingId?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: unknown;
  readonly updatedAt?: unknown;
}): SkillLockEntry => ({
  type: "registry",
  owner: normalizeHandle(opts.owner),
  name: extensionName(opts.name),
  resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
  integrity: opts.integrity ?? "sha512-AAAA==",
  sourceName: opts.sourceName ?? "default",
  publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
});

export const makeRegistryPackLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly publisherBindingId?: string;
  readonly sourceHash?: string;
  readonly resolvedSkills?: Readonly<Record<string, unknown>>;
  readonly resolvedMcpServers?: Readonly<Record<string, unknown>>;
  readonly resolvedSubagents?: Readonly<Record<string, unknown>>;
  readonly installedAt?: unknown;
  readonly updatedAt?: unknown;
}): RegistryPackLockEntry =>
  buildRegistryPackLockEntry({
    owner: normalizeHandle(opts.owner),
    name: extensionName(opts.name),
    resolvedVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
    integrity: opts.integrity ?? "sha512-AAAA==",
    sourceName: opts.sourceName ?? "default",
    publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
    manifestContentIdentity:
      opts.sourceHash === undefined
        ? TEST_CONTENT_IDENTITY
        : Schema.decodeUnknownSync(SourceHashSchema)(opts.sourceHash),
  });

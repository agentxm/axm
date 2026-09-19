/** @internal Test-only workspace read facts and fixture builders. */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { LockfileReader, makeLockfileReader } from "./lockfile-reader.js";
import { makeSettingsReader, SettingsReader } from "./settings-reader.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import { WorkspaceRecords, type WorkspaceRecordsService } from "./workspace-records.js";
import type { WorkspaceDocumentsService } from "./documents.js";
import type { WorkspaceLayout } from "./layout.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import type { ReadModelRecordRow, PackagingKind } from "./read-model-record-types.js";
import type {
  WorkspaceLockfileReadFailure,
  WorkspaceSettingsReadFailure,
  WorkspaceStateReadFailure,
} from "./contracts.js";
import type { ExtensionInventory } from "./read-model/extensions/inventory.js";
import {
  makeRegistryPackLockEntry as buildRegistryPackLockEntry,
  LOCKFILE_VERSION,
  type Lockfile,
  type McpServerLockEntry,
  type RegistryPackLockEntry,
  type SkillLockEntry,
} from "../lockfile/index.js";
import { createDefaultSettings, type Settings, type SourceHostConfig } from "../settings/index.js";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { type InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeAbsolutePathSync,
  decodeRelativePathSync,
} from "@agentxm/extension-model/unstable/path-types";
import {
  decodeVersionSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";

const emptyRows = (): Effect.Effect<ReadonlyArray<ReadModelRecordRow>, WorkspaceStateReadFailure> =>
  Effect.succeed([]);
const emptyInventory = (): Effect.Effect<ExtensionInventory, WorkspaceStateReadFailure> =>
  Effect.succeed({
    items: [],
    count: 0,
    configuredCount: 0,
    implicitCount: 0,
    installedCount: 0,
    leftoverCount: 0,
    undeclaredCount: 0,
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
  (
    type: InstallableExtensionType,
  ): Effect.Effect<ReadonlyArray<ReadModelRecordRow>, WorkspaceStateReadFailure> =>
    Effect.succeed(byType[type] ?? []);

/** No-op stubs for read-model record getters. */
export const readModelRecordStubs = {
  getInventory: () =>
    Effect.succeed({
      items: [],
      count: 0,
      configuredCount: 0,
      implicitCount: 0,
      installedCount: 0,
      leftoverCount: 0,
      undeclaredCount: 0,
      unmanagedCount: 0,
    }),
  getExtensionInventory: emptyInventory,
  rows: emptyRows,
} as const;

export interface WorkspaceReadTestFacts {
  readonly baseDir: string;
  readonly runtimeDir?: string;
  readonly layout?: WorkspaceLayout;
  readonly settings?: Settings;
  readonly settingsDocument?: Effect.Effect<Settings, WorkspaceSettingsReadFailure>;
  readonly lockfile?: Lockfile;
  readonly acceptedResolutions?: Effect.Effect<Lockfile, WorkspaceLockfileReadFailure>;
  readonly graph?: DesiredStateGraph;
  readonly graphDocument?: Effect.Effect<DesiredStateGraph, WorkspaceStateReadFailure>;
  readonly records?: Partial<WorkspaceRecordsService>;
}

/** Owned workspace read ports built from explicit test facts. */
export const WorkspaceReadTest = (
  facts: WorkspaceReadTestFacts,
): Layer.Layer<
  WorkspaceLocation | SettingsReader | LockfileReader | DesiredStateReader | WorkspaceRecords
> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const runtimeDir = facts.runtimeDir ?? path.join(facts.baseDir, ".axm");
      const defaultLayout: WorkspaceLayout = {
        scope: "project",
        workspaceRoot: decodeAbsolutePathSync(path.resolve(facts.baseDir)),
        projectRoot: decodeAbsolutePathSync(path.resolve(facts.baseDir)),
        settingsPath: decodeAbsolutePathSync(path.resolve(facts.baseDir, "axm.json")),
        lockPath: decodeAbsolutePathSync(path.resolve(facts.baseDir, "axm-lock.yaml")),
        runtimeDir: decodeAbsolutePathSync(path.resolve(runtimeDir)),
        acquiredRoot: decodeAbsolutePathSync(path.resolve(facts.baseDir, "agent_extensions")),
        authoredRoot: (type) =>
          decodeAbsolutePathSync(
            path.resolve(facts.baseDir, type === "mcp-server" ? "mcps" : `${type}s`),
          ),
      };
      const selectedLayout = facts.layout ?? defaultLayout;
      const location: WorkspaceLocationService = {
        scope: selectedLayout.scope,
        projectRoot: decodeAbsolutePathSync(path.resolve(facts.baseDir)),
        userHome: decodeAbsolutePathSync(path.resolve(facts.baseDir)),
        projectRuntimeDir: runtimeDir,
        userRuntimeDir: runtimeDir,
        baseDir: facts.baseDir,
        runtimeDir,
        settingsPath: selectedLayout.settingsPath,
        lockPath: selectedLayout.lockPath,
        layout: yield* Ref.make(selectedLayout),
        builtInSources: [],
      };
      const settingsDocument = facts.settings ?? createDefaultSettings();
      const lockfileDocument =
        facts.lockfile ?? ({ lockfileVersion: LOCKFILE_VERSION, skills: {} } satisfies Lockfile);
      const documents: WorkspaceDocumentsService = {
        settings: () => facts.settingsDocument ?? Effect.succeed(settingsDocument),
        acceptedResolutions: facts.acceptedResolutions ?? Effect.succeed(lockfileDocument),
        acceptedResolutionState: Effect.succeed("ok"),
        writeSettings: () => Effect.void,
        commitAcceptedResolutions: () => Effect.void,
      };
      const desired: DesiredStateReaderService = {
        graph: () =>
          facts.graphDocument ??
          Effect.succeed(
            facts.graph ?? {
              complete: true,
              nodes: [],
              mcpSourceClosures: [],
              problems: [],
            },
          ),
        isRequiredByInstalledPack: (target) =>
          Effect.succeed(
            facts.graph?.nodes.some(
              (node) =>
                node.type === target.type &&
                node.name === target.name &&
                node.origins.some((origin) => origin.type === "pack"),
            ) ?? false,
          ),
      };
      const settings = makeSettingsReader(
        location,
        documents,
        yield* Ref.make<Option.Option<ReadonlyArray<SourceHostConfig>>>(Option.none()),
      );
      const lockfile = makeLockfileReader(documents, desired);
      return Layer.mergeAll(
        Layer.succeed(WorkspaceLocation, location),
        Layer.succeed(SettingsReader, settings),
        Layer.succeed(LockfileReader, lockfile),
        Layer.succeed(DesiredStateReader, desired),
        Layer.mock(WorkspaceRecords, {
          getInventory: facts.records?.getInventory ?? readModelRecordStubs.getInventory,
          getExtensionInventory:
            facts.records?.getExtensionInventory ?? readModelRecordStubs.getExtensionInventory,
          rows: facts.records?.rows ?? readModelRecordStubs.rows,
        }),
      );
    }),
  );

export const TEST_CONTENT_IDENTITY = Schema.decodeUnknownSync(SourceHashSchema)("test-content");
export const TEST_TREE_INTEGRITY = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

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

export const writeWorkspaceFiles = (runtimeDir: string, opts: WriteWorkspaceFilesOptions = {}) => {
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
    lockfileVersion: 8,
    skills: opts.lockfileSkills ?? {},
    ...(hasEntries(opts.lockfileMcpServers) && { mcps: opts.lockfileMcpServers }),
    ...(hasEntries(opts.lockfileSubagents) && { subagents: opts.lockfileSubagents }),
    ...(hasEntries(opts.lockfileRules) && { rules: opts.lockfileRules }),
    ...(hasEntries(opts.lockfilePacks) && { packs: opts.lockfilePacks }),
  };

  const workspaceRoot = path.dirname(runtimeDir);
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "axm.json"), JSON.stringify(settings));
  fs.writeFileSync(path.join(workspaceRoot, "axm-lock.yaml"), YAML.stringify(lockfile));
};

export const makeLocalSkillLockEntry = (opts?: {
  readonly path?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: unknown;
  readonly updatedAt?: unknown;
}): SkillLockEntry => ({
  source: { type: "path", path: decodeRelativePathSync(opts?.path ?? "installed") },
  identity: {
    owner: decodeHandleSync("@test"),
    name: decodeExtensionNameSync("installed"),
  },
  resolved: { tree: TEST_CONTENT_IDENTITY },
  treeIntegrity: TEST_TREE_INTEGRITY,
});

export const makeRegistrySkillLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly endpoint?: URL;
  readonly publisherBindingId?: string;
  readonly agents?: ReadonlyArray<string>;
  readonly installedAt?: unknown;
  readonly updatedAt?: unknown;
}): SkillLockEntry => ({
  source: {
    type: "registry",
    url: opts.endpoint ?? new URL("https://registry.agentxm.ai"),
  },
  identity: { owner: opts.owner, name: decodeExtensionNameSync(opts.name) },
  resolved: {
    version: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
    integrity: opts.integrity ?? "sha512-AAAA==",
    publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
  },
  treeIntegrity: TEST_TREE_INTEGRITY,
});

export const makeRegistryMcpServerLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly endpoint?: URL;
  readonly publisherBindingId?: string;
  readonly installedAt?: unknown;
  readonly updatedAt?: unknown;
}): McpServerLockEntry => ({
  source: {
    type: "registry",
    url: opts.endpoint ?? new URL("https://registry.agentxm.ai"),
  },
  identity: { owner: opts.owner, name: decodeExtensionNameSync(opts.name) },
  resolved: {
    version: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
    integrity: opts.integrity ?? "sha512-AAAA==",
    publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
  },
  treeIntegrity: TEST_TREE_INTEGRITY,
});

export const makeRegistryPackLockEntry = (opts: {
  readonly owner: Handle;
  readonly name: string;
  readonly resolvedVersion?: Version;
  readonly integrity?: string;
  readonly sourceName?: string;
  readonly endpoint?: URL;
  readonly publisherBindingId?: string;
  readonly sourceHash?: string;
  readonly resolvedSkills?: Readonly<Record<string, unknown>>;
  readonly resolvedMcpServers?: Readonly<Record<string, unknown>>;
  readonly resolvedSubagents?: Readonly<Record<string, unknown>>;
  readonly installedAt?: unknown;
  readonly updatedAt?: unknown;
}): RegistryPackLockEntry =>
  buildRegistryPackLockEntry({
    source: {
      type: "registry",
      url: opts.endpoint ?? new URL("https://registry.agentxm.ai"),
    },
    identity: { owner: opts.owner, name: decodeExtensionNameSync(opts.name) },
    resolved: {
      version: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
      integrity: opts.integrity ?? "sha512-AAAA==",
      publisherBindingId: opts.publisherBindingId ?? "hbnd_test",
    },
    manifestVersion: opts.resolvedVersion ?? decodeVersionSync("1.0.0"),
    manifestContentIdentity:
      opts.sourceHash === undefined
        ? TEST_CONTENT_IDENTITY
        : Schema.decodeUnknownSync(SourceHashSchema)(opts.sourceHash),
    members: [],
    treeIntegrity: TEST_TREE_INTEGRITY,
  });

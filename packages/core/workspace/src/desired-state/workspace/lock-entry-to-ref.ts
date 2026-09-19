/**
 * Reconstruct extension refs from lockfile entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { LockEntryEndpointConflict, LockEntryNameInvalid } from "./errors.js";
import type { SettingsReadError, WorkspaceRootEscape } from "./read-model/errors.js";
import {
  decodeExtensionNameSync,
  toExtensionTypePlural,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  KnowledgeLockEntry,
  HookLockEntry,
  PackLockEntry,
  McpServerLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type {
  GitBasedSource,
  RegistrySource,
} from "@agentxm/extension-model/unstable/sources/types";
import { acquiredExtensionDisplayPathFromLockEntry } from "./extension-paths.js";

/** Failure of the caller-supplied configured-source lookup. */
export type LockEntrySourceLookupError = SettingsReadError | WorkspaceRootEscape;

/** Every failure a lock-entry-to-ref translation can produce. */
export type LockEntryToRefError =
  LockEntryNameInvalid | LockEntryEndpointConflict | LockEntrySourceLookupError;

type SourceLockEntry =
  | SkillLockEntry
  | KnowledgeLockEntry
  | McpServerLockEntry
  | SubagentLockEntry
  | RuleLockEntry
  | HookLockEntry;

type AnyLockEntry = SourceLockEntry | PackLockEntry;
type RegistryLockEntry = Extract<AnyLockEntry, { readonly source: { readonly type: "registry" } }>;
type GitLockEntry = Extract<AnyLockEntry, { readonly source: { readonly type: "git" } }>;
type PathLockEntry = Extract<AnyLockEntry, { readonly source: { readonly type: "path" } }>;

const isRegistryLockEntry = (entry: AnyLockEntry): entry is RegistryLockEntry =>
  entry.source.type === "registry";
const isGitLockEntry = (entry: AnyLockEntry): entry is GitLockEntry => entry.source.type === "git";
const isPathLockEntry = (entry: AnyLockEntry): entry is PathLockEntry =>
  entry.source.type === "path";

interface LockEntryToRefDeps {
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly scope: WorkspaceScope;
  /** Registry name explicitly used by the desired declaration, when one exists. */
  readonly registrySourceName?: string;
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<
    Option.Option<import("../settings/index.js").SourceHostConfig>,
    LockEntrySourceLookupError
  >;
}

const fileHref = (path: string): string => pathToFileURL(path).href;

const localLockEntryPath = (deps: LockEntryToRefDeps, entryPath: string): string =>
  deps.path.resolve(deps.baseDir, entryPath);

const invalidName = (name: string) => new LockEntryNameInvalid({ name });

const decodeLockEntryName = (name: string): Effect.Effect<ExtensionName, LockEntryToRefError> =>
  Effect.try({
    try: () => decodeExtensionNameSync(name),
    catch: () => invalidName(name),
  });

const registrySourceFromEntry = (
  entry: Extract<
    SourceLockEntry | PackLockEntry,
    { readonly source: { readonly type: "registry" } }
  >,
  deps: LockEntryToRefDeps,
): Effect.Effect<RegistrySource, LockEntryToRefError> =>
  Effect.gen(function* () {
    if (deps.registrySourceName !== undefined) {
      const configured = yield* deps.getConfiguredSourceByName(deps.registrySourceName);
      if (
        Option.isSome(configured) &&
        configured.value.type === "registry" &&
        configured.value.location.href !== entry.source.url.href
      ) {
        return yield* new LockEntryEndpointConflict({
          sourceKind: "Registry",
          sourceName: deps.registrySourceName,
          acceptedEndpoint: entry.source.url.href,
          resolvedEndpoint: configured.value.location.href,
        });
      }
    }
    return {
      type: "registry" as const,
      name: deps.registrySourceName ?? "registry",
      location: entry.source.url,
      owner: Option.some(entry.identity.owner),
    };
  });

const gitBasedSourceFromEntry = (
  entry: Extract<SourceLockEntry | PackLockEntry, { readonly source: { readonly type: "git" } }>,
): GitBasedSource => ({
  type: "git",
  url: entry.source.url,
  ref: Option.fromUndefinedOr(entry.source.revision),
  subPath: Option.fromUndefinedOr(entry.source.path),
});

const lockEntryLocation = (
  deps: LockEntryToRefDeps,
  entry: SourceLockEntry | PackLockEntry,
  extensionType: Parameters<typeof toExtensionTypePlural>[0],
  workspaceName: string,
): string => {
  const root =
    deps.scope === "project"
      ? `${deps.baseDir}/agent_extensions`
      : `${deps.baseDir}/.axm/workspace/agent_extensions`;
  return fileHref(
    acquiredExtensionDisplayPathFromLockEntry(
      root,
      entry,
      toExtensionTypePlural(extensionType),
      workspaceName,
    ),
  );
};

export const skillLockEntryToRef = (
  name: string,
  entry: SkillLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<SkillExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<SkillExtensionRef, LockEntryToRefError> => {
      if (isRegistryLockEntry(entry)) {
        return Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
          type: "skill" as const,
          refType: "registry" as const,
          source,
          owner: entry.identity.owner,
          publisherBindingId: entry.resolved.publisherBindingId,
          name: entry.identity.name,
          version: entry.resolved.version,
          integrity:
            entry.resolved.integrity.length > 0
              ? Option.some(entry.resolved.integrity)
              : Option.none(),
          packages: [],
          skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
        }));
      }
      if (isPathLockEntry(entry)) {
        const skillSourcePath = localLockEntryPath(deps, entry.source.path);
        return Effect.succeed({
          type: "skill" as const,
          refType: "local" as const,
          ...(entry.identity.owner === undefined ? {} : { owner: entry.identity.owner }),
          name: entry.identity.name,
          source: { type: "local" as const, path: skillSourcePath },
          location: fileHref(skillSourcePath),
          sourcePath: entry.source.path,
          portable: entry.identity.owner === undefined,
          skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
        });
      }
      if (isGitLockEntry(entry)) {
        return Effect.map(Effect.succeed(gitBasedSourceFromEntry(entry)), (source) => ({
          type: "skill" as const,
          refType: "git-hosted" as const,
          ...(entry.identity.owner === undefined ? {} : { owner: entry.identity.owner }),
          name: entry.identity.name,
          source,
          ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
          portable: entry.identity.owner === undefined,
          location: lockEntryLocation(deps, entry, "skill", extensionName),
          gitTreeSha: entry.resolved.tree,
          gitCommitSha: entry.resolved.commit,
          skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
        }));
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

export const mcpServerLockEntryToRef = (
  name: string,
  entry: McpServerLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<McpServerExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<McpServerExtensionRef, LockEntryToRefError> => {
      if (isRegistryLockEntry(entry)) {
        return Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
          type: "mcp-server" as const,
          refType: "registry" as const,
          source,
          owner: entry.identity.owner,
          publisherBindingId: entry.resolved.publisherBindingId,
          name: entry.identity.name,
          version: entry.resolved.version,
          integrity:
            entry.resolved.integrity.length > 0
              ? Option.some(entry.resolved.integrity)
              : Option.none(),
          packages: [],
          server: { name: extensionName },
        }));
      }
      if (isPathLockEntry(entry)) {
        const mcpServerSourcePath = localLockEntryPath(deps, entry.source.path);
        return Effect.succeed({
          type: "mcp-server" as const,
          refType: "local" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source: { type: "local" as const, path: mcpServerSourcePath },
          location: fileHref(mcpServerSourcePath),
          sourcePath: entry.source.path,
          server: { name: extensionName },
        });
      }
      if (isGitLockEntry(entry)) {
        return Effect.map(Effect.succeed(gitBasedSourceFromEntry(entry)), (source) => ({
          type: "mcp-server" as const,
          refType: "git-hosted" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source,
          ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
          location: lockEntryLocation(deps, entry, "mcp-server", extensionName),
          gitTreeSha: entry.resolved.tree,
          gitCommitSha: entry.resolved.commit,
          server: { name: extensionName },
        }));
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

export const subagentLockEntryToRef = (
  name: string,
  entry: SubagentLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<SubagentExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<SubagentExtensionRef, LockEntryToRefError> => {
      if (isRegistryLockEntry(entry)) {
        return Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
          type: "subagent" as const,
          refType: "registry" as const,
          source,
          owner: entry.identity.owner,
          publisherBindingId: entry.resolved.publisherBindingId,
          name: entry.identity.name,
          version: entry.resolved.version,
          integrity:
            entry.resolved.integrity.length > 0
              ? Option.some(entry.resolved.integrity)
              : Option.none(),
          packages: [],
          subagent: { name: extensionName, description: Option.none() },
        }));
      }
      if (isPathLockEntry(entry)) {
        const subagentSourcePath = localLockEntryPath(deps, entry.source.path);
        return Effect.succeed({
          type: "subagent" as const,
          refType: "local" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source: { type: "local" as const, path: subagentSourcePath },
          location: fileHref(subagentSourcePath),
          sourcePath: entry.source.path,
          subagent: { name: extensionName, description: Option.none() },
        });
      }
      if (isGitLockEntry(entry)) {
        return Effect.map(Effect.succeed(gitBasedSourceFromEntry(entry)), (source) => ({
          type: "subagent" as const,
          refType: "git-hosted" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source,
          ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
          location: lockEntryLocation(deps, entry, "subagent", extensionName),
          gitTreeSha: entry.resolved.tree,
          gitCommitSha: entry.resolved.commit,
          subagent: { name: extensionName, description: Option.none() },
        }));
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

export const ruleLockEntryToRef = (
  name: string,
  entry: RuleLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<RuleExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<RuleExtensionRef, LockEntryToRefError> => {
      if (isRegistryLockEntry(entry)) {
        return Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
          type: "rule" as const,
          refType: "registry" as const,
          source,
          owner: entry.identity.owner,
          publisherBindingId: entry.resolved.publisherBindingId,
          name: entry.identity.name,
          version: entry.resolved.version,
          integrity:
            entry.resolved.integrity.length > 0
              ? Option.some(entry.resolved.integrity)
              : Option.none(),
          packages: [],
          rule: { name: extensionName },
        }));
      }
      if (isPathLockEntry(entry)) {
        const sourcePath = localLockEntryPath(deps, entry.source.path);
        return Effect.succeed({
          type: "rule" as const,
          refType: "local" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source: { type: "local" as const, path: sourcePath },
          location: fileHref(sourcePath),
          sourcePath: entry.source.path,
          rule: { name: extensionName },
        });
      }
      if (isGitLockEntry(entry)) {
        return Effect.map(Effect.succeed(gitBasedSourceFromEntry(entry)), (source) => ({
          type: "rule" as const,
          refType: "git-hosted" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source,
          ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
          location: lockEntryLocation(deps, entry, "rule", extensionName),
          gitTreeSha: entry.resolved.tree,
          gitCommitSha: entry.resolved.commit,
          rule: { name: extensionName },
        }));
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

export const hookLockEntryToRef = (
  name: string,
  entry: HookLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<HookExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<HookExtensionRef, LockEntryToRefError> => {
      if (isRegistryLockEntry(entry)) {
        return Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
          type: "hook" as const,
          refType: "registry" as const,
          source,
          owner: entry.identity.owner,
          publisherBindingId: entry.resolved.publisherBindingId,
          name: entry.identity.name,
          version: entry.resolved.version,
          integrity:
            entry.resolved.integrity.length > 0
              ? Option.some(entry.resolved.integrity)
              : Option.none(),
          packages: [],
          hook: { name: extensionName },
        }));
      }
      if (isPathLockEntry(entry)) {
        const sourcePath = localLockEntryPath(deps, entry.source.path);
        return Effect.succeed({
          type: "hook" as const,
          refType: "local" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source: { type: "local" as const, path: sourcePath },
          location: fileHref(sourcePath),
          sourcePath: entry.source.path,
          hook: { name: extensionName },
        });
      }
      if (isGitLockEntry(entry)) {
        return Effect.map(Effect.succeed(gitBasedSourceFromEntry(entry)), (source) => ({
          type: "hook" as const,
          refType: "git-hosted" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source,
          ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
          location: lockEntryLocation(deps, entry, "hook", extensionName),
          gitTreeSha: entry.resolved.tree,
          gitCommitSha: entry.resolved.commit,
          hook: { name: extensionName },
        }));
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

export const knowledgeLockEntryToRef = (
  name: string,
  entry: KnowledgeLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<KnowledgeExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<KnowledgeExtensionRef, LockEntryToRefError> => {
      if (isRegistryLockEntry(entry)) {
        return Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
          type: "knowledge" as const,
          refType: "registry" as const,
          source,
          owner: entry.identity.owner,
          publisherBindingId: entry.resolved.publisherBindingId,
          name: entry.identity.name,
          version: entry.resolved.version,
          integrity:
            entry.resolved.integrity.length > 0
              ? Option.some(entry.resolved.integrity)
              : Option.none(),
          packages: [],
          knowledge: { name: extensionName },
        }));
      }
      if (isPathLockEntry(entry)) {
        const sourcePath = localLockEntryPath(deps, entry.source.path);
        return Effect.succeed({
          type: "knowledge" as const,
          refType: "local" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source: { type: "local" as const, path: sourcePath },
          location: fileHref(sourcePath),
          sourcePath: entry.source.path,
          knowledge: { name: extensionName },
        });
      }
      if (isGitLockEntry(entry)) {
        return Effect.map(Effect.succeed(gitBasedSourceFromEntry(entry)), (source) => ({
          type: "knowledge" as const,
          refType: "git-hosted" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          source,
          ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
          location: lockEntryLocation(deps, entry, "knowledge", extensionName),
          gitTreeSha: entry.resolved.tree,
          gitCommitSha: entry.resolved.commit,
          knowledge: { name: extensionName },
        }));
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

export const packLockEntryToRef = (
  name: string,
  entry: PackLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<PackRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<PackRef, LockEntryToRefError> => {
      if (isRegistryLockEntry(entry)) {
        return Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
          type: "pack" as const,
          refType: "registry" as const,
          source,
          owner: entry.identity.owner,
          publisherBindingId: entry.resolved.publisherBindingId,
          name: entry.identity.name,
          version: entry.resolved.version,
          integrity:
            entry.resolved.integrity.length > 0
              ? Option.some(entry.resolved.integrity)
              : Option.none(),
          packages: [],
          pack: { name: extensionName, dependencies: {} },
        }));
      }
      if (isPathLockEntry(entry)) {
        const sourcePath = localLockEntryPath(deps, entry.source.path);
        return Effect.succeed({
          type: "pack" as const,
          refType: "local" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          version: entry.manifestVersion,
          source: { type: "local" as const, path: sourcePath },
          location: fileHref(sourcePath),
          sourcePath: entry.source.path,
          sourceMembers: [],
          pack: { name: extensionName, dependencies: {} },
        });
      }
      if (isGitLockEntry(entry)) {
        return Effect.map(Effect.succeed(gitBasedSourceFromEntry(entry)), (source) => ({
          type: "pack" as const,
          refType: "git-hosted" as const,
          owner: entry.identity.owner,
          name: entry.identity.name,
          version: entry.manifestVersion,
          source,
          ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
          location: lockEntryLocation(deps, entry, "pack", extensionName),
          gitTreeSha: entry.resolved.tree,
          gitCommitSha: entry.resolved.commit,
          sourceMembers: [],
          pack: { name: extensionName, dependencies: {} },
        }));
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

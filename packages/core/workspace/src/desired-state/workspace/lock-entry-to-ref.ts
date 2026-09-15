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
import {
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
  LockEntrySourceMissing,
  LockEntrySourceTypeConflict,
  LockEntryUrlInvalid,
} from "./errors.js";
import type { SettingsReadError, WorkspaceRootEscape } from "./read-model/errors.js";
import {
  decodeExtensionNameSync,
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
import type { SourceHostConfig } from "../settings/index.js";
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

/** Failure of the caller-supplied configured-source lookup. */
export type LockEntrySourceLookupError = SettingsReadError | WorkspaceRootEscape;

/** Every failure a lock-entry-to-ref translation can produce. */
export type LockEntryToRefError =
  | LockEntrySourceMissing
  | LockEntryUrlInvalid
  | LockEntryNameInvalid
  | LockEntryEndpointConflict
  | LockEntrySourceTypeConflict
  | LockEntrySourceLookupError;

type SourceLockEntry =
  | SkillLockEntry
  | KnowledgeLockEntry
  | McpServerLockEntry
  | SubagentLockEntry
  | RuleLockEntry
  | HookLockEntry;

interface LockEntryToRefDeps {
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly scope: WorkspaceScope;
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, LockEntrySourceLookupError>;
}

const fileHref = (path: string): string => pathToFileURL(path).href;

const localLockEntryPath = (deps: LockEntryToRefDeps, entryPath: string): string =>
  deps.path.resolve(deps.baseDir, entryPath);

const missingSource = (entryType: string, sourceName: string) =>
  new LockEntrySourceMissing({ entryType, sourceName });

const invalidUrl = (value: string) => new LockEntryUrlInvalid({ value });

const invalidName = (name: string) => new LockEntryNameInvalid({ name });

const decodeLockEntryName = (name: string): Effect.Effect<ExtensionName, LockEntryToRefError> =>
  Effect.try({
    try: () => decodeExtensionNameSync(name),
    catch: () => invalidName(name),
  });

const hasSourceType =
  <TType extends "github" | "gitlab" | "bitbucket" | "azurerepos">(sourceType: TType) =>
  (source: SourceHostConfig): source is Extract<SourceHostConfig, { readonly type: TType }> =>
    source.type === sourceType;

const registrySourceFromEntry = (
  entry: Extract<SourceLockEntry | PackLockEntry, { readonly type: "registry" }>,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<RegistrySource, LockEntryToRefError> =>
  Effect.gen(function* () {
    const configured = yield* getSourceByName(entry.sourceName);
    if (Option.isNone(configured) || configured.value.type !== "registry") {
      return yield* missingSource("registry", entry.sourceName);
    }
    if (configured.value.location.href !== entry.endpoint.href) {
      return yield* new LockEntryEndpointConflict({
        sourceKind: "Registry",
        sourceName: entry.sourceName,
        acceptedEndpoint: entry.endpoint.href,
        resolvedEndpoint: configured.value.location.href,
      });
    }
    return {
      type: "registry" as const,
      name: configured.value.name,
      location: entry.endpoint,
      owner: Option.some(entry.owner),
    };
  });

function findSourceConfig(
  sourceType: "github",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "github" }>, LockEntryToRefError>;
function findSourceConfig(
  sourceType: "gitlab",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "gitlab" }>, LockEntryToRefError>;
function findSourceConfig(
  sourceType: "bitbucket",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "bitbucket" }>, LockEntryToRefError>;
function findSourceConfig(
  sourceType: "azurerepos",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "azurerepos" }>, LockEntryToRefError>;
function findSourceConfig(
  sourceType: "github" | "gitlab" | "bitbucket" | "azurerepos",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<SourceHostConfig, LockEntryToRefError> {
  return Effect.gen(function* () {
    const configured = yield* getSourceByName(sourceName);
    if (Option.isNone(configured) || !hasSourceType(sourceType)(configured.value)) {
      return yield* new LockEntrySourceTypeConflict({
        sourceKind: sourceType,
        sourceName,
      });
    }
    if (configured.value.url.href !== endpoint.href) {
      return yield* new LockEntryEndpointConflict({
        sourceKind: sourceType,
        sourceName,
        acceptedEndpoint: endpoint.href,
        resolvedEndpoint: configured.value.url.href,
      });
    }
    return configured.value;
  });
}

const gitBasedSourceFromEntry = (
  entry: Exclude<SourceLockEntry, { readonly type: "registry" | "local" | "inline" | "workspace" }>,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<GitBasedSource, LockEntryToRefError> => {
  switch (entry.type) {
    case "github":
      return Effect.map(
        findSourceConfig("github", entry.sourceName, entry.endpoint, getSourceByName),
        (source) => ({
          type: "github" as const,
          name: source.name,
          url: source.url,
          owner: entry.owner,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        }),
      );
    case "gitlab":
      return Effect.map(
        findSourceConfig("gitlab", entry.sourceName, entry.endpoint, getSourceByName),
        (source) => ({
          type: "gitlab" as const,
          name: source.name,
          url: source.url,
          owner: entry.owner,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        }),
      );
    case "bitbucket":
      return Effect.map(
        findSourceConfig("bitbucket", entry.sourceName, entry.endpoint, getSourceByName),
        (source) => ({
          type: "bitbucket" as const,
          name: source.name,
          url: source.url,
          owner: entry.owner,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        }),
      );
    case "azurerepos":
      return Effect.map(
        findSourceConfig("azurerepos", entry.sourceName, entry.endpoint, getSourceByName),
        (source) => ({
          type: "azurerepos" as const,
          name: source.name,
          url: source.url,
          organization: entry.organization,
          project: entry.project,
          repo: entry.repo,
          ref: Option.fromUndefinedOr(entry.ref),
          subPath: Option.fromUndefinedOr(entry.path),
        }),
      );
    case "git":
      return Effect.map(
        Effect.try({
          try: () => new URL(entry.url),
          catch: () => invalidUrl(entry.url),
        }),
        (url) => ({
          type: "git" as const,
          url,
          ref: Option.fromUndefinedOr(entry.ref),
        }),
      );
  }
};

const lockEntryLocation = (
  deps: LockEntryToRefDeps,
  entry: Exclude<SourceLockEntry, { readonly type: "registry" | "local" }>,
): string => {
  const root =
    deps.scope === "project"
      ? `${deps.baseDir}/agent_extensions`
      : `${deps.baseDir}/.axm/workspace/agent_extensions`;
  const selected = entry.path === undefined ? "" : `/${entry.path}`;
  switch (entry.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
      return fileHref(`${root}/${entry.sourceName}/${entry.owner}/${entry.repo}${selected}`);
    case "azurerepos":
      return fileHref(
        `${root}/${entry.sourceName}/${entry.organization}/${entry.project}/${entry.repo}${selected}`,
      );
    case "git": {
      const url = new URL(entry.url);
      const repository = url.pathname.replace(/^\/+|\/+$/gu, "").replace(/\.git$/u, "");
      return fileHref(`${root}/git/${url.hostname}/${repository}${selected}`);
    }
  }
};

export const skillLockEntryToRef = (
  name: string,
  entry: SkillLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<SkillExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<SkillExtensionRef, LockEntryToRefError> => {
      switch (entry.type) {
        case "registry":
          return Effect.map(
            registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "skill" as const,
              refType: "registry" as const,
              source,
              owner: entry.owner,
              publisherBindingId: entry.publisherBindingId,
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              packages: [],
              skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
            }),
          );
        case "local": {
          const skillSourcePath = localLockEntryPath(deps, entry.path);
          return Effect.succeed({
            type: "skill" as const,
            refType: "local" as const,
            ...(entry.packageOwner === undefined ? {} : { owner: entry.packageOwner }),
            name: entry.packageName,
            source: { type: "local" as const, path: skillSourcePath },
            location: fileHref(skillSourcePath),
            sourcePath: entry.path,
            portable: entry.packageFormat === "agent-skill",
            skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
          });
        }
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "skill" as const,
              refType: "git-hosted" as const,
              ...(entry.packageOwner === undefined ? {} : { owner: entry.packageOwner }),
              name: entry.packageName,
              source,
              ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              portable: entry.packageFormat === "agent-skill",
              location: lockEntryLocation(deps, entry),
              gitTreeSha: entry.resolvedTree,
              gitCommitSha: entry.resolvedCommit,
              skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
            }),
          );
      }
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
      switch (entry.type) {
        case "registry":
          return Effect.map(
            registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "mcp-server" as const,
              refType: "registry" as const,
              source,
              owner: entry.owner,
              publisherBindingId: entry.publisherBindingId,
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              packages: [],
              server: { name: extensionName },
            }),
          );
        case "local": {
          const mcpServerSourcePath = localLockEntryPath(deps, entry.path);
          return Effect.succeed({
            type: "mcp-server" as const,
            refType: "local" as const,
            owner: entry.packageOwner,
            name: entry.packageName,
            source: { type: "local" as const, path: mcpServerSourcePath },
            location: fileHref(mcpServerSourcePath),
            sourcePath: entry.path,
            server: { name: extensionName },
          });
        }
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "mcp-server" as const,
              refType: "git-hosted" as const,
              owner: entry.packageOwner,
              name: entry.packageName,
              source,
              ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              location: lockEntryLocation(deps, entry),
              gitTreeSha: entry.resolvedTree,
              gitCommitSha: entry.resolvedCommit,
              server: { name: extensionName },
            }),
          );
      }
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
      switch (entry.type) {
        case "registry":
          return Effect.map(
            registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "subagent" as const,
              refType: "registry" as const,
              source,
              owner: entry.owner,
              publisherBindingId: entry.publisherBindingId,
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              packages: [],
              subagent: { name: extensionName, description: Option.none() },
            }),
          );
        case "local": {
          const subagentSourcePath = localLockEntryPath(deps, entry.path);
          return Effect.succeed({
            type: "subagent" as const,
            refType: "local" as const,
            owner: entry.packageOwner,
            name: entry.packageName,
            source: { type: "local" as const, path: subagentSourcePath },
            location: fileHref(subagentSourcePath),
            sourcePath: entry.path,
            subagent: { name: extensionName, description: Option.none() },
          });
        }
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "subagent" as const,
              refType: "git-hosted" as const,
              owner: entry.packageOwner,
              name: entry.packageName,
              source,
              ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              location: lockEntryLocation(deps, entry),
              gitTreeSha: entry.resolvedTree,
              gitCommitSha: entry.resolvedCommit,
              subagent: { name: extensionName, description: Option.none() },
            }),
          );
      }
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
      switch (entry.type) {
        case "registry":
          return Effect.map(
            registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "rule" as const,
              refType: "registry" as const,
              source,
              owner: entry.owner,
              publisherBindingId: entry.publisherBindingId,
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              packages: [],
              rule: { name: extensionName },
            }),
          );
        case "local": {
          const sourcePath = localLockEntryPath(deps, entry.path);
          return Effect.succeed({
            type: "rule" as const,
            refType: "local" as const,
            owner: entry.packageOwner,
            name: entry.packageName,
            source: { type: "local" as const, path: sourcePath },
            location: fileHref(sourcePath),
            sourcePath: entry.path,
            rule: { name: extensionName },
          });
        }
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "rule" as const,
              refType: "git-hosted" as const,
              owner: entry.packageOwner,
              name: entry.packageName,
              source,
              ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              location: lockEntryLocation(deps, entry),
              gitTreeSha: entry.resolvedTree,
              gitCommitSha: entry.resolvedCommit,
              rule: { name: extensionName },
            }),
          );
      }
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
      switch (entry.type) {
        case "registry":
          return Effect.map(
            registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "hook" as const,
              refType: "registry" as const,
              source,
              owner: entry.owner,
              publisherBindingId: entry.publisherBindingId,
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              packages: [],
              hook: { name: extensionName },
            }),
          );
        case "local": {
          const sourcePath = localLockEntryPath(deps, entry.path);
          return Effect.succeed({
            type: "hook" as const,
            refType: "local" as const,
            owner: entry.packageOwner,
            name: entry.packageName,
            source: { type: "local" as const, path: sourcePath },
            location: fileHref(sourcePath),
            sourcePath: entry.path,
            hook: { name: extensionName },
          });
        }
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "hook" as const,
              refType: "git-hosted" as const,
              owner: entry.packageOwner,
              name: entry.packageName,
              source,
              ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              location: lockEntryLocation(deps, entry),
              gitTreeSha: entry.resolvedTree,
              gitCommitSha: entry.resolvedCommit,
              hook: { name: extensionName },
            }),
          );
      }
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
      switch (entry.type) {
        case "registry":
          return Effect.map(
            registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "knowledge" as const,
              refType: "registry" as const,
              source,
              owner: entry.owner,
              publisherBindingId: entry.publisherBindingId,
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              packages: [],
              knowledge: { name: extensionName },
            }),
          );
        case "local": {
          const sourcePath = localLockEntryPath(deps, entry.path);
          return Effect.succeed({
            type: "knowledge" as const,
            refType: "local" as const,
            owner: entry.packageOwner,
            name: entry.packageName,
            source: { type: "local" as const, path: sourcePath },
            location: fileHref(sourcePath),
            sourcePath: entry.path,
            knowledge: { name: extensionName },
          });
        }
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "knowledge" as const,
              refType: "git-hosted" as const,
              owner: entry.packageOwner,
              name: entry.packageName,
              source,
              ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              location: lockEntryLocation(deps, entry),
              gitTreeSha: entry.resolvedTree,
              gitCommitSha: entry.resolvedCommit,
              knowledge: { name: extensionName },
            }),
          );
      }
    },
  );

export const packLockEntryToRef = (
  name: string,
  entry: PackLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<PackRef, LockEntryToRefError> =>
  Effect.flatMap(decodeLockEntryName(name), (extensionName) => {
    return Effect.map(
      registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
      (source): PackRef => ({
        type: "pack" as const,
        refType: "registry" as const,
        source,
        owner: entry.owner,
        publisherBindingId: entry.publisherBindingId,
        name: entry.name,
        version: entry.resolvedVersion,
        integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
        packages: [],
        pack: { name: extensionName, dependencies: {} },
      }),
    );
  });

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
import { makeAppError, type AppError } from "../app-error/index.js";
import { decodeExtensionNameSync, type ExtensionName } from "../extensions/index.js";
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
import type { PackRef } from "../packs/refs.js";
import type { McpServerExtensionRef } from "../mcps/refs.js";
import type { SkillExtensionRef } from "../skills/refs.js";
import type { SubagentExtensionRef } from "../subagents/refs.js";
import type { KnowledgeExtensionRef } from "../knowledge/refs.js";
import type { RuleExtensionRef } from "../rules/refs.js";
import type { HookExtensionRef } from "../hooks/refs.js";
import type { WorkspaceScope } from "../workspace/scope.js";
import type { GitBasedSource, RegistrySource } from "./types.js";

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
  ) => Effect.Effect<Option.Option<SourceHostConfig>, AppError>;
}

const fileHref = (path: string): string => pathToFileURL(path).href;

const localLockEntryPath = (deps: LockEntryToRefDeps, entryPath: string): string =>
  deps.path.resolve(deps.baseDir, entryPath);

const missingSource = (entryType: string, sourceName: string) =>
  makeAppError({
    code: "internal",
    detail: `Lockfile ${entryType} entry references source "${sourceName}", but that source is not configured`,
  });

const invalidUrl = (value: string) =>
  makeAppError({
    code: "validation",
    detail: `Lockfile source URL is invalid: ${value}`,
  });

const invalidName = (name: string) =>
  makeAppError({
    code: "validation",
    detail: `Lockfile extension name is invalid: ${name}`,
  });

const decodeLockEntryName = (name: string): Effect.Effect<ExtensionName, AppError> =>
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
): Effect.Effect<RegistrySource, AppError> =>
  Effect.gen(function* () {
    const configured = yield* getSourceByName(entry.sourceName);
    if (Option.isNone(configured) || configured.value.type !== "registry") {
      return yield* missingSource("registry", entry.sourceName);
    }
    if (configured.value.location.href !== entry.endpoint.href) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Lockfile Registry source "${entry.sourceName}" accepts endpoint ${entry.endpoint.href}, but configuration resolves it to ${configured.value.location.href}`,
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
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "github" }>, AppError>;
function findSourceConfig(
  sourceType: "gitlab",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "gitlab" }>, AppError>;
function findSourceConfig(
  sourceType: "bitbucket",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "bitbucket" }>, AppError>;
function findSourceConfig(
  sourceType: "azurerepos",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "azurerepos" }>, AppError>;
function findSourceConfig(
  sourceType: "github" | "gitlab" | "bitbucket" | "azurerepos",
  sourceName: string,
  endpoint: URL,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
) {
  return Effect.gen(function* () {
    const configured = yield* getSourceByName(sourceName);
    if (Option.isNone(configured) || !hasSourceType(sourceType)(configured.value)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Lockfile ${sourceType} entry references source "${sourceName}", but configuration does not resolve that name to ${sourceType}`,
      });
    }
    if (configured.value.url.href !== endpoint.href) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Lockfile ${sourceType} source "${sourceName}" accepts endpoint ${endpoint.href}, but configuration resolves it to ${configured.value.url.href}`,
      });
    }
    return configured.value;
  });
}

const gitBasedSourceFromEntry = (
  entry: Exclude<SourceLockEntry, { readonly type: "registry" | "local" | "inline" | "workspace" }>,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<GitBasedSource, AppError> => {
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
): Effect.Effect<SkillExtensionRef, AppError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<SkillExtensionRef, AppError> => {
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
): Effect.Effect<McpServerExtensionRef, AppError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<McpServerExtensionRef, AppError> => {
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
): Effect.Effect<SubagentExtensionRef, AppError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<SubagentExtensionRef, AppError> => {
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
): Effect.Effect<RuleExtensionRef, AppError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<RuleExtensionRef, AppError> => {
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
): Effect.Effect<HookExtensionRef, AppError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<HookExtensionRef, AppError> => {
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
): Effect.Effect<KnowledgeExtensionRef, AppError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<KnowledgeExtensionRef, AppError> => {
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
): Effect.Effect<PackRef, AppError> =>
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

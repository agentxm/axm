/**
 * Reconstruct extension refs from lockfile entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "../app-error/index.js";
import { decodeExtensionNameSync, type ExtensionName } from "../extensions/index.js";
import type {
  CommandLockEntry,
  ExtensionPackLockEntry,
  McpServerLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { CommandExtensionRef } from "../commands/refs.js";
import type { ExtensionPackRef } from "../packs/refs.js";
import type { McpServerExtensionRef } from "../mcp-servers/refs.js";
import type { SkillExtensionRef } from "../skills/refs.js";
import type { SubagentExtensionRef } from "../subagents/refs.js";
import type { GitBasedSource, RegistrySource } from "./types.js";

type SourceLockEntry = SkillLockEntry | CommandLockEntry | McpServerLockEntry | SubagentLockEntry;

interface LockEntryToRefDeps {
  readonly baseDir: string;
  readonly getConfiguredSources: () => Effect.Effect<ReadonlyArray<SourceHostConfig>, AppError>;
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, AppError>;
}

const fileHref = (path: string): string => pathToFileURL(path).href;

const missingSource = (entryType: string, sourceName: string) =>
  makeAppError({
    code: "LOCK_ENTRY_SOURCE_NOT_CONFIGURED",
    what: `Lockfile ${entryType} entry references source "${sourceName}", but that source is not configured`,
  });

const invalidUrl = (value: string) =>
  makeAppError({
    code: "LOCK_ENTRY_SOURCE_INVALID_URL",
    what: `Lockfile source URL is invalid: ${value}`,
  });

const invalidName = (name: string) =>
  makeAppError({
    code: "LOCK_ENTRY_NAME_INVALID",
    what: `Lockfile extension name is invalid: ${name}`,
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
  entry: Extract<SourceLockEntry | ExtensionPackLockEntry, { readonly type: "registry" }>,
  getSourceByName: LockEntryToRefDeps["getConfiguredSourceByName"],
): Effect.Effect<RegistrySource, AppError> =>
  Effect.gen(function* () {
    const configured = yield* getSourceByName(entry.sourceName);
    if (Option.isNone(configured) || configured.value.type !== "registry") {
      return yield* missingSource("registry", entry.sourceName);
    }
    return {
      type: "registry" as const,
      location: configured.value.location,
      owner: Option.some(entry.owner),
    };
  });

function findSourceConfig(
  sourceType: "github",
  getSources: LockEntryToRefDeps["getConfiguredSources"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "github" }>, AppError>;
function findSourceConfig(
  sourceType: "gitlab",
  getSources: LockEntryToRefDeps["getConfiguredSources"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "gitlab" }>, AppError>;
function findSourceConfig(
  sourceType: "bitbucket",
  getSources: LockEntryToRefDeps["getConfiguredSources"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "bitbucket" }>, AppError>;
function findSourceConfig(
  sourceType: "azurerepos",
  getSources: LockEntryToRefDeps["getConfiguredSources"],
): Effect.Effect<Extract<SourceHostConfig, { readonly type: "azurerepos" }>, AppError>;
function findSourceConfig(
  sourceType: "github" | "gitlab" | "bitbucket" | "azurerepos",
  getSources: LockEntryToRefDeps["getConfiguredSources"],
) {
  return Effect.gen(function* () {
    const sources = yield* getSources();
    const source = sources.find(hasSourceType(sourceType));
    if (source === undefined) {
      return yield* makeAppError({
        code: "LOCK_ENTRY_SOURCE_NOT_CONFIGURED",
        what: `Lockfile ${sourceType} entry requires a configured ${sourceType} source`,
      });
    }
    return source;
  });
}

const gitBasedSourceFromEntry = (
  entry: Exclude<SourceLockEntry, { readonly type: "registry" | "local" }>,
  getSources: LockEntryToRefDeps["getConfiguredSources"],
): Effect.Effect<GitBasedSource, AppError> => {
  switch (entry.type) {
    case "github":
      return Effect.map(findSourceConfig("github", getSources), (source) => ({
        type: "github" as const,
        url: source.url,
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      }));
    case "gitlab":
      return Effect.map(findSourceConfig("gitlab", getSources), (source) => ({
        type: "gitlab" as const,
        url: source.url,
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      }));
    case "bitbucket":
      return Effect.map(findSourceConfig("bitbucket", getSources), (source) => ({
        type: "bitbucket" as const,
        url: source.url,
        owner: entry.owner,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      }));
    case "azurerepos":
      return Effect.map(findSourceConfig("azurerepos", getSources), (source) => ({
        type: "azurerepos" as const,
        url: source.url,
        organization: entry.organization,
        project: entry.project,
        repo: entry.repo,
        ref: Option.fromUndefinedOr(entry.ref),
        subPath: Option.fromUndefinedOr(entry.path),
      }));
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

const lockEntryLocation = (baseDir: string, pluralType: string, name: string): string =>
  fileHref(`${baseDir}/.axm/extensions/external/${pluralType}/${name}`);

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
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              compatiblePackages: [],
              skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
            }),
          );
        case "local":
          return Effect.succeed({
            type: "skill" as const,
            refType: "local" as const,
            source: { type: "local" as const, path: entry.path },
            location: fileHref(entry.path),
            skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
          });
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSources),
            (source) => ({
              type: "skill" as const,
              refType: "git-hosted" as const,
              source,
              location: lockEntryLocation(deps.baseDir, "skills", extensionName),
              gitTreeSha: Option.fromUndefinedOr(entry.gitTreeHash),
              skill: { name: extensionName, description: Option.none(), metadata: Option.none() },
            }),
          );
      }
    },
  );

export const commandLockEntryToRef = (
  name: string,
  entry: CommandLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<CommandExtensionRef, AppError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<CommandExtensionRef, AppError> => {
      switch (entry.type) {
        case "registry":
          return Effect.map(
            registrySourceFromEntry(entry, deps.getConfiguredSourceByName),
            (source) => ({
              type: "command" as const,
              refType: "registry" as const,
              source,
              owner: entry.owner,
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              compatiblePackages: [],
              command: { name: extensionName },
            }),
          );
        case "local":
          return Effect.succeed({
            type: "command" as const,
            refType: "local" as const,
            source: { type: "local" as const, path: entry.path },
            location: fileHref(entry.path),
            command: { name: extensionName },
          });
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSources),
            (source) => ({
              type: "command" as const,
              refType: "git-hosted" as const,
              source,
              location: lockEntryLocation(deps.baseDir, "commands", extensionName),
              gitTreeSha: Option.fromUndefinedOr(entry.gitTreeHash),
              command: { name: extensionName },
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
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              compatiblePackages: [],
              server: { name: extensionName },
            }),
          );
        case "local":
          return Effect.succeed({
            type: "mcp-server" as const,
            refType: "local" as const,
            source: { type: "local" as const, path: entry.path },
            location: fileHref(entry.path),
            server: { name: extensionName },
          });
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSources),
            (source) => ({
              type: "mcp-server" as const,
              refType: "git-hosted" as const,
              source,
              location: lockEntryLocation(deps.baseDir, "mcp-servers", extensionName),
              gitTreeSha: Option.fromUndefinedOr(entry.gitTreeHash),
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
              name: entry.name,
              version: entry.resolvedVersion,
              integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
              compatiblePackages: [],
              subagent: { name: extensionName, description: Option.none() },
            }),
          );
        case "local":
          return Effect.succeed({
            type: "subagent" as const,
            refType: "local" as const,
            source: { type: "local" as const, path: entry.path },
            location: fileHref(entry.path),
            subagent: { name: extensionName, description: Option.none() },
          });
        case "github":
        case "gitlab":
        case "bitbucket":
        case "azurerepos":
        case "git":
          return Effect.map(
            gitBasedSourceFromEntry(entry, deps.getConfiguredSources),
            (source) => ({
              type: "subagent" as const,
              refType: "git-hosted" as const,
              source,
              location: lockEntryLocation(deps.baseDir, "subagents", extensionName),
              gitTreeSha: Option.fromUndefinedOr(entry.gitTreeHash),
              subagent: { name: extensionName, description: Option.none() },
            }),
          );
      }
    },
  );

export const extensionPackLockEntryToRef = (
  name: string,
  entry: ExtensionPackLockEntry,
  deps: Pick<LockEntryToRefDeps, "getConfiguredSourceByName">,
): Effect.Effect<ExtensionPackRef, AppError> =>
  Effect.flatMap(decodeLockEntryName(name), (extensionName) =>
    Effect.map(registrySourceFromEntry(entry, deps.getConfiguredSourceByName), (source) => ({
      type: "pack" as const,
      refType: "registry" as const,
      source,
      owner: entry.owner,
      name: entry.name,
      version: entry.resolvedVersion,
      integrity: entry.integrity.length > 0 ? Option.some(entry.integrity) : Option.none(),
      compatiblePackages: [],
      pack: {
        name: extensionName,
        skills: {},
        commands: {},
        mcpServers: {},
        subagents: {},
      },
    })),
  );

/**
 * Reconstruct extension refs from lockfile entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { toFileLocation } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { LockEntryEndpointConflict, LockEntryNameInvalid } from "./errors.js";
import type { SettingsReadError, WorkspaceRootEscape } from "./read-model/errors.js";
import {
  decodeExtensionNameSync,
  formatFqn,
  toExtensionTypePlural,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  forgeCoordinateFromGitUrl,
  printForgeCoordinateBody,
} from "@agentxm/extension-model/unstable/sources/forge-grammar";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
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
  LocalSource,
  RegistrySource,
  SourceParams,
} from "@agentxm/extension-model/unstable/sources/types";
import { acquiredExtensionDisplayPathFromLockEntry } from "./extension-paths.js";
import { acquiredRootDisplayPath } from "./display-paths.js";
import type { LockEntryByType } from "./entry-accessors.js";

/** Failure of the caller-supplied configured-source lookup. */
export type LockEntrySourceLookupError = SettingsReadError | WorkspaceRootEscape;

/** Every failure a lock-entry-to-ref translation can produce. */
export type LockEntryToRefError =
  LockEntryNameInvalid | LockEntryEndpointConflict | LockEntrySourceLookupError;

export type LockEntry = LockEntryByType[InstallableExtensionType];

export const isRegistryLockEntry = <E extends LockEntry>(
  entry: E,
): entry is Extract<E, { readonly source: { readonly type: "registry" } }> =>
  entry.source.type === "registry";
export const isGitLockEntry = <E extends LockEntry>(
  entry: E,
): entry is Extract<E, { readonly source: { readonly type: "git" } }> =>
  entry.source.type === "git";
export const isPathLockEntry = <E extends LockEntry>(
  entry: E,
): entry is Extract<E, { readonly source: { readonly type: "path" } }> =>
  entry.source.type === "path";

export interface LockEntryToRefDeps {
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

const fileHref = (path: string): string => toFileLocation(path);

const localLockEntryPath = (deps: LockEntryToRefDeps, entryPath: string): string =>
  deps.path.resolve(deps.baseDir, entryPath);

const invalidName = (name: string) => new LockEntryNameInvalid({ name });

const decodeLockEntryName = (name: string): Effect.Effect<ExtensionName, LockEntryToRefError> =>
  Effect.try({
    try: () => decodeExtensionNameSync(name),
    catch: () => invalidName(name),
  });

const registrySourceFromEntry = (
  entry: Extract<LockEntry, { readonly source: { readonly type: "registry" } }>,
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

export function lockEntrySource(
  entry: Extract<LockEntry, { readonly source: { readonly type: "registry" } }>,
): RegistrySource;
export function lockEntrySource(
  entry: Extract<LockEntry, { readonly source: { readonly type: "git" } }>,
): GitBasedSource;
export function lockEntrySource(
  entry: Extract<LockEntry, { readonly source: { readonly type: "path" } }>,
): LocalSource;
export function lockEntrySource(entry: LockEntry): RegistrySource | GitBasedSource | LocalSource;
export function lockEntrySource(entry: LockEntry): RegistrySource | GitBasedSource | LocalSource {
  if (isRegistryLockEntry(entry))
    return {
      type: "registry",
      name: "registry",
      location: entry.source.url,
      owner: Option.some(entry.identity.owner),
    };
  if (isGitLockEntry(entry))
    return {
      type: "git",
      url: entry.source.url,
      ref: Option.fromUndefinedOr(entry.source.revision),
      subPath: Option.fromUndefinedOr(entry.source.path),
    };
  return { type: "local", path: entry.source.path };
}

const lockEntryLocation = (
  deps: LockEntryToRefDeps,
  entry: LockEntry,
  extensionType: Parameters<typeof toExtensionTypePlural>[0],
  workspaceName: string,
): string => {
  const root = `${deps.baseDir}/${acquiredRootDisplayPath(deps.scope)}`;
  return fileHref(
    acquiredExtensionDisplayPathFromLockEntry(
      root,
      entry,
      toExtensionTypePlural(extensionType),
      workspaceName,
    ),
  );
};

const acceptedRegistryFields = (
  entry: Extract<LockEntry, { readonly source: { readonly type: "registry" } }>,
  deps: LockEntryToRefDeps,
) =>
  Effect.map(registrySourceFromEntry(entry, deps), (source) => ({
    refType: "registry" as const,
    source,
    owner: entry.identity.owner,
    publisherBindingId: entry.resolved.publisherBindingId,
    name: entry.identity.name,
    version: entry.resolved.version,
    integrity:
      entry.resolved.integrity.length > 0 ? Option.some(entry.resolved.integrity) : Option.none(),
    packages: [],
  }));

const acceptedLocalFields = (
  deps: LockEntryToRefDeps,
  entry: Extract<LockEntry, { readonly source: { readonly type: "path" } }>,
) => {
  const absolute = localLockEntryPath(deps, entry.source.path);
  return {
    refType: "local" as const,
    name: entry.identity.name,
    source: { type: "local" as const, path: absolute },
    location: fileHref(absolute),
    sourcePath: entry.source.path,
  };
};

const acceptedGitFields = (
  deps: LockEntryToRefDeps,
  entry: Extract<LockEntry, { readonly source: { readonly type: "git" } }>,
  type: InstallableExtensionType,
  name: ExtensionName,
) => ({
  refType: "git-hosted" as const,
  name: entry.identity.name,
  source: lockEntrySource(entry),
  ...(entry.source.path === undefined ? {} : { sourcePath: entry.source.path }),
  location: lockEntryLocation(deps, entry, type, name),
  gitTreeSha: entry.resolved.tree,
  gitCommitSha: entry.resolved.commit,
});

const skillLockEntryToRef = (
  name: string,
  entry: SkillLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<SkillExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<SkillExtensionRef, LockEntryToRefError> => {
      const skill = { name: extensionName, description: Option.none(), metadata: Option.none() };
      if (isRegistryLockEntry(entry))
        return Effect.map(acceptedRegistryFields(entry, deps), (fields) => ({
          ...fields,
          type: "skill" as const,
          skill,
        }));
      if (isPathLockEntry(entry))
        return Effect.succeed({
          ...acceptedLocalFields(deps, entry),
          type: "skill" as const,
          ...(entry.identity.owner === undefined ? {} : { owner: entry.identity.owner }),
          portable: entry.identity.owner === undefined,
          skill,
        });
      if (isGitLockEntry(entry))
        return Effect.succeed({
          ...acceptedGitFields(deps, entry, "skill", extensionName),
          type: "skill" as const,
          ...(entry.identity.owner === undefined ? {} : { owner: entry.identity.owner }),
          portable: entry.identity.owner === undefined,
          skill,
        });
      return Effect.die("Unrecognized lock entry source family");
    },
  );

const mcpServerLockEntryToRef = (
  name: string,
  entry: McpServerLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<McpServerExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<McpServerExtensionRef, LockEntryToRefError> => {
      const server = { name: extensionName };
      if (isRegistryLockEntry(entry))
        return Effect.map(acceptedRegistryFields(entry, deps), (fields) => ({
          ...fields,
          type: "mcp-server" as const,
          server,
        }));
      if (isPathLockEntry(entry))
        return Effect.succeed({
          ...acceptedLocalFields(deps, entry),
          type: "mcp-server" as const,
          owner: entry.identity.owner,
          server,
        });
      if (isGitLockEntry(entry))
        return Effect.succeed({
          ...acceptedGitFields(deps, entry, "mcp-server", extensionName),
          type: "mcp-server" as const,
          owner: entry.identity.owner,
          server,
        });
      return Effect.die("Unrecognized lock entry source family");
    },
  );

const subagentLockEntryToRef = (
  name: string,
  entry: SubagentLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<SubagentExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<SubagentExtensionRef, LockEntryToRefError> => {
      const subagent = { name: extensionName, description: Option.none() };
      if (isRegistryLockEntry(entry))
        return Effect.map(acceptedRegistryFields(entry, deps), (fields) => ({
          ...fields,
          type: "subagent" as const,
          subagent,
        }));
      if (isPathLockEntry(entry))
        return Effect.succeed({
          ...acceptedLocalFields(deps, entry),
          type: "subagent" as const,
          owner: entry.identity.owner,
          subagent,
        });
      if (isGitLockEntry(entry))
        return Effect.succeed({
          ...acceptedGitFields(deps, entry, "subagent", extensionName),
          type: "subagent" as const,
          owner: entry.identity.owner,
          subagent,
        });
      return Effect.die("Unrecognized lock entry source family");
    },
  );

const ruleLockEntryToRef = (
  name: string,
  entry: RuleLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<RuleExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<RuleExtensionRef, LockEntryToRefError> => {
      const rule = { name: extensionName };
      if (isRegistryLockEntry(entry))
        return Effect.map(acceptedRegistryFields(entry, deps), (fields) => ({
          ...fields,
          type: "rule" as const,
          rule,
        }));
      if (isPathLockEntry(entry))
        return Effect.succeed({
          ...acceptedLocalFields(deps, entry),
          type: "rule" as const,
          owner: entry.identity.owner,
          rule,
        });
      if (isGitLockEntry(entry))
        return Effect.succeed({
          ...acceptedGitFields(deps, entry, "rule", extensionName),
          type: "rule" as const,
          owner: entry.identity.owner,
          rule,
        });
      return Effect.die("Unrecognized lock entry source family");
    },
  );

const hookLockEntryToRef = (
  name: string,
  entry: HookLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<HookExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<HookExtensionRef, LockEntryToRefError> => {
      const hook = { name: extensionName };
      if (isRegistryLockEntry(entry))
        return Effect.map(acceptedRegistryFields(entry, deps), (fields) => ({
          ...fields,
          type: "hook" as const,
          hook,
        }));
      if (isPathLockEntry(entry))
        return Effect.succeed({
          ...acceptedLocalFields(deps, entry),
          type: "hook" as const,
          owner: entry.identity.owner,
          hook,
        });
      if (isGitLockEntry(entry))
        return Effect.succeed({
          ...acceptedGitFields(deps, entry, "hook", extensionName),
          type: "hook" as const,
          owner: entry.identity.owner,
          hook,
        });
      return Effect.die("Unrecognized lock entry source family");
    },
  );

const knowledgeLockEntryToRef = (
  name: string,
  entry: KnowledgeLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<KnowledgeExtensionRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<KnowledgeExtensionRef, LockEntryToRefError> => {
      const knowledge = { name: extensionName };
      if (isRegistryLockEntry(entry))
        return Effect.map(acceptedRegistryFields(entry, deps), (fields) => ({
          ...fields,
          type: "knowledge" as const,
          knowledge,
        }));
      if (isPathLockEntry(entry))
        return Effect.succeed({
          ...acceptedLocalFields(deps, entry),
          type: "knowledge" as const,
          owner: entry.identity.owner,
          knowledge,
        });
      if (isGitLockEntry(entry))
        return Effect.succeed({
          ...acceptedGitFields(deps, entry, "knowledge", extensionName),
          type: "knowledge" as const,
          owner: entry.identity.owner,
          knowledge,
        });
      return Effect.die("Unrecognized lock entry source family");
    },
  );

const packLockEntryToRef = (
  name: string,
  entry: PackLockEntry,
  deps: LockEntryToRefDeps,
): Effect.Effect<PackRef, LockEntryToRefError> =>
  Effect.flatMap(
    decodeLockEntryName(name),
    (extensionName): Effect.Effect<PackRef, LockEntryToRefError> => {
      const pack = { name: extensionName, dependencies: {} };
      if (isRegistryLockEntry(entry))
        return Effect.map(acceptedRegistryFields(entry, deps), (fields) => ({
          ...fields,
          type: "pack" as const,
          pack,
        }));
      // A Pack's source is the view root it and its members were discovered under.
      if (isPathLockEntry(entry))
        return Effect.succeed({
          ...acceptedLocalFields(deps, entry),
          type: "pack" as const,
          owner: entry.identity.owner,
          version: entry.manifestVersion,
          source: { type: "local" as const, path: localLockEntryPath(deps, entry.sourceRoot) },
          sourceMembers: [],
          pack,
        });
      if (isGitLockEntry(entry)) {
        const fields = acceptedGitFields(deps, entry, "pack", extensionName);
        return Effect.succeed({
          ...fields,
          type: "pack" as const,
          owner: entry.identity.owner,
          version: entry.manifestVersion,
          source: {
            type: "git" as const,
            url: entry.source.url,
            ref: Option.fromUndefinedOr(entry.source.revision),
            subPath: Option.fromUndefinedOr(entry.sourceRoot),
          },
          sourceMembers: [],
          pack,
        });
      }
      return Effect.die("Unrecognized lock entry source family");
    },
  );

type RefFor<T extends InstallableExtensionType> = T extends "skill"
  ? SkillExtensionRef
  : T extends "mcp-server"
    ? McpServerExtensionRef
    : T extends "subagent"
      ? SubagentExtensionRef
      : T extends "rule"
        ? RuleExtensionRef
        : T extends "hook"
          ? HookExtensionRef
          : T extends "knowledge"
            ? KnowledgeExtensionRef
            : PackRef;

/** Reconstruct each accepted lock row with its exact extension-ref type. */
export const lockEntryToRef: {
  readonly [T in InstallableExtensionType]: (
    name: string,
    entry: LockEntryByType[T],
    deps: LockEntryToRefDeps,
  ) => Effect.Effect<RefFor<T>, LockEntryToRefError>;
} = {
  skill: skillLockEntryToRef,
  "mcp-server": mcpServerLockEntryToRef,
  subagent: subagentLockEntryToRef,
  rule: ruleLockEntryToRef,
  hook: hookLockEntryToRef,
  knowledge: knowledgeLockEntryToRef,
  pack: packLockEntryToRef,
};

/** Resolve a lock row's source fields for declaration and comparison. */
export const lockEntryToSourceParams = (entry: LockEntry): SourceParams => {
  if (isRegistryLockEntry(entry))
    return { type: "registry", sourceName: entry.source.url.href, owner: Option.none() };
  const source = lockEntrySource(entry);
  if (source.type === "registry")
    return { type: "registry", sourceName: source.location.href, owner: Option.none() };
  return source;
};

/** Whether a declaration locator denotes the accepted source. */
export const lockEntryMatchesSourceLocator = (entry: LockEntry, locator: string): boolean => {
  if (printSourceParams(lockEntryToSourceParams(entry)) === locator) return true;
  if (!isGitLockEntry(entry)) return false;
  return Option.exists(
    forgeCoordinateFromGitUrl(
      entry.source.url,
      Option.fromUndefinedOr(entry.source.revision),
      Option.fromUndefinedOr(entry.source.path),
    ),
    (coordinate) =>
      coordinate.forge === "github" && locator === printForgeCoordinateBody(coordinate),
  );
};

/** Print an accepted Skill source locator with its immutable Registry identity. */
export const printSkillLockSourceLocator = (_lockName: string, entry: SkillLockEntry): string =>
  isRegistryLockEntry(entry) && entry.identity.owner !== undefined
    ? `registry:${entry.source.url.href}:${formatFqn({ owner: entry.identity.owner, type: "skill", name: entry.identity.name })}@${entry.resolved.version}`
    : printSourceParams(lockEntryToSourceParams(entry));

/** Resolved Registry version, when present on this lock row. */
export const lockEntryVersion = (entry: LockEntry): string | undefined =>
  isRegistryLockEntry(entry) ? entry.resolved.version : undefined;

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import { makeAppError, type AppError } from "../app-error/index.js";
import {
  extensionTypeToPlural,
  installableExtensionTypes,
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionRef,
  type InstallableExtensionType,
} from "../extensions/index.js";
import { createRegistryClient } from "../registry/index.js";
import type { DeprecationView } from "../registry/schema.js";
import { resolveSource, SourceHostProviders } from "../source-resolution/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
import { isWorkspaceSourceLocator } from "../sources/workspace.js";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";
import type { ReadModelRecordRow } from "./read-model-record-types.js";
import { WorkspaceMutations, type WorkspaceMutationsService } from "./service-interface.js";
import { checkCurrency } from "./version-currency/index.js";

export type ExtensionListFilter = "all" | "outdated" | "deprecated";

export type ExtensionAssessmentState =
  | "not-checked"
  | "current"
  | "available"
  | "changed"
  | "active"
  | "deprecated"
  | "unknown"
  | "not-applicable";

export interface ExtensionAssessment {
  readonly state: ExtensionAssessmentState;
  readonly reason?: string;
  readonly installedVersion?: string;
  readonly constraint?: string;
  readonly latestMatching?: string;
  readonly latestAvailable?: string;
  readonly installedRevision?: string;
  readonly currentRevision?: string;
  readonly deprecation?: DeprecationView;
}

export interface ExtensionListItem {
  readonly ref: string;
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly management: "configured" | "implicit" | "unmanaged";
  readonly installed: boolean;
  readonly enabled: boolean | null;
  readonly version?: string;
  readonly source?: string;
  readonly sourceName?: string;
  readonly assessment: ExtensionAssessment;
}

type AcceptedEntry =
  | SkillLockEntry
  | McpServerLockEntry
  | SubagentLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry
  | PackLockEntry;

const getAcceptedEntry = (
  ws: WorkspaceMutationsService,
  type: InstallableExtensionType,
  name: string,
): Effect.Effect<Option.Option<AcceptedEntry>, AppError> => {
  switch (type) {
    case "skill":
      return ws.getLockedSkill(name);
    case "mcp-server":
      return ws.getLockedMcpServer(name);
    case "subagent":
      return ws.getLockedSubagent(name);
    case "rule":
      return ws.getLockedRuleEntry(name);
    case "hook":
      return ws.getLockedHookEntry(name);
    case "knowledge":
      return ws.getLockedKnowledgeEntry(name);
    case "pack":
      return ws.getLockedPack(name);
  }
};

const recordSource = (row: ReadModelRecordRow | undefined): string | undefined => {
  if (row === undefined) return undefined;
  const source = row.source;
  if (source === undefined) return undefined;
  return typeof source === "string" ? source : Option.getOrUndefined(source);
};

const refName = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "mcp-server":
      return ref.server.name;
    case "subagent":
      return ref.subagent.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
    case "pack":
      return ref.pack.name;
  }
};

const inventoryKey = (type: string, name: string): string => `${type}:${name}`;

export const collectExtensionListItems = Effect.fn("Workspace.collectExtensionListItems")(
  function* (type?: InstallableExtensionType) {
    const ws = yield* WorkspaceMutations;
    const inventory = yield* ws.records.getInventory(type === undefined ? {} : { type });
    const types = type === undefined ? installableExtensionTypes : [type];
    const rowsByKey = new Map<string, ReadModelRecordRow>();
    const rowsByType = yield* Effect.forEach(types, (itemType) => ws.records.rows(itemType), {
      concurrency: "unbounded",
    });
    for (const row of rowsByType.flat()) {
      rowsByKey.set(inventoryKey(row.type, row.name), row);
    }
    const [skills, mcps, subagents, rules, hooks, knowledge, packs] = yield* Effect.all([
      ws.getLockedSkills(),
      ws.getLockedMcpServers(),
      ws.getLockedSubagents(),
      ws.getLockedRules(),
      ws.getLockedHooks(),
      ws.getLockedKnowledge(),
      ws.getLockedPacks(),
    ]);
    const accepted = (
      itemType: InstallableExtensionType,
      name: string,
    ): AcceptedEntry | undefined => {
      switch (itemType) {
        case "skill":
          return skills[name];
        case "mcp-server":
          return mcps[name];
        case "subagent":
          return subagents[name];
        case "rule":
          return rules[name];
        case "hook":
          return hooks[name];
        case "knowledge":
          return knowledge[name];
        case "pack":
          return packs[name];
      }
    };

    return inventory.items.map((row): ExtensionListItem => {
      const locked = accepted(row.type, row.name);
      const configuredSource = recordSource(rowsByKey.get(inventoryKey(row.type, row.name)));
      const lockedSource =
        locked === undefined ? undefined : printSourceParams(lockEntryToSourceParams(locked));
      const source = configuredSource ?? lockedSource;
      const identitySource =
        locked?.type === "registry"
          ? `${locked.owner}/${extensionTypeToPlural[row.type]}/${locked.name}`
          : (configuredSource ?? lockedSource);
      const fqnSource =
        identitySource !== undefined && isWorkspaceSourceLocator(identitySource)
          ? identitySource.slice("workspace:".length)
          : identitySource;
      const parsed = fqnSource === undefined ? undefined : parseExtensionFqnParts(fqnSource);
      const ref =
        parsed === undefined
          ? `${extensionTypeToPlural[row.type]}/${row.name}`
          : `${parsed.owner}/${extensionTypeToPlural[parsed.type]}/${parsed.name}`;
      return {
        ref,
        type: row.type,
        name: row.name,
        management: row.classification.lifecycle,
        installed: row.installed,
        enabled: row.enabled,
        ...(locked?.type === "registry" ? { version: locked.resolvedVersion } : {}),
        ...(source === undefined ? {} : { source }),
        ...(locked?.type === "registry" ? { sourceName: locked.sourceName } : {}),
        assessment: { state: "not-checked" },
      };
    });
  },
);

const decodeInstalledVersion = (value: string, ref: string) =>
  Schema.decodeUnknownEffect(VersionSchema)(value).pipe(
    Effect.mapError(() =>
      makeAppError({ code: "validation", detail: `Accepted version for ${ref} is invalid` }),
    ),
  );

const constraintFromSource = (source: string | undefined) => {
  if (source === undefined) return Option.none<string>();
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  return Option.fromUndefinedOr(parsed?.versionRange);
};

const registryAssessment = Effect.fn("Workspace.registryExtensionAssessment")(function* (
  item: ExtensionListItem,
  filter: Exclude<ExtensionListFilter, "all">,
  record: AcceptedEntry,
) {
  const ws = yield* WorkspaceMutations;
  if (record.type !== "registry") {
    return {
      state: "unknown",
      reason: "Missing accepted Registry identity",
    } satisfies ExtensionAssessment;
  }
  const identity = { owner: record.owner, type: item.type, name: record.name };
  const sourceName = record.sourceName;
  const source = yield* ws.getConfiguredSourceByName(sourceName);
  if (Option.isNone(source) || source.value.type !== "registry") {
    return {
      state: "unknown",
      reason: `Supplying Registry source "${sourceName}" is not configured`,
    } satisfies ExtensionAssessment;
  }
  const client = yield* createRegistryClient(source.value.location.href);
  const index = yield* client.getExtensionIndex({
    owner: identity.owner,
    type: identity.type,
    name: identity.name,
  });
  if (Option.isNone(index)) {
    return {
      state: "unknown",
      reason: "Extension index was not found",
    } satisfies ExtensionAssessment;
  }
  if (filter === "deprecated") {
    return index.value.deprecation === null
      ? ({ state: "active" } satisfies ExtensionAssessment)
      : ({
          state: "deprecated",
          deprecation: index.value.deprecation,
        } satisfies ExtensionAssessment);
  }
  const installedVersion = yield* decodeInstalledVersion(record.resolvedVersion, item.ref);
  const constraint = constraintFromSource(item.source);
  const currency = checkCurrency(installedVersion, constraint, index.value);
  const updateAvailable = Option.exists(currency.latestMatching, (latestMatching) =>
    semver.gt(latestMatching, installedVersion),
  );
  return {
    state: updateAvailable ? "available" : "current",
    installedVersion,
    ...Option.match(constraint, {
      onNone: () => ({}),
      onSome: (value) => ({ constraint: value }),
    }),
    ...Option.match(currency.latestMatching, {
      onNone: () => ({}),
      onSome: (value) => ({ latestMatching: value }),
    }),
    latestAvailable: currency.latestAvailable,
  } satisfies ExtensionAssessment;
});

const gitAssessment = Effect.fn("Workspace.gitExtensionAssessment")(function* (
  item: ExtensionListItem,
  record: AcceptedEntry,
) {
  const providers = yield* SourceHostProviders;
  if (record.type === "registry" || record.type === "local") {
    return {
      state: "unknown",
      reason: "Accepted immutable resolution is missing",
    } satisfies ExtensionAssessment;
  }
  const source = yield* resolveSource(printSourceParams(lockEntryToSourceParams(record))).pipe(
    Effect.result,
  );
  if (source._tag === "Failure") {
    return { state: "unknown", reason: source.failure.detail } satisfies ExtensionAssessment;
  }
  const refs = yield* providers
    .find(source.success, {
      names: [item.name],
      type: item.type,
      owner: Option.none(),
      versionRange: Option.none(),
    })
    .pipe(Effect.result);
  if (refs._tag === "Failure") {
    return { state: "unknown", reason: refs.failure.detail } satisfies ExtensionAssessment;
  }
  const match = refs.success.find((ref) => ref.type === item.type && refName(ref) === item.name);
  if (match === undefined || match.refType !== "git-hosted") {
    return {
      state: "unknown",
      reason: "Source revision could not be compared",
    } satisfies ExtensionAssessment;
  }
  return {
    state:
      match.gitTreeSha === record.resolvedTree && match.gitCommitSha === record.resolvedCommit
        ? "current"
        : "changed",
    installedRevision: `${record.resolvedCommit}:${record.resolvedTree}`,
    currentRevision: `${match.gitCommitSha}:${match.gitTreeSha}`,
  } satisfies ExtensionAssessment;
});

const gitAuthorities = new Set(["github", "gitlab", "bitbucket", "azurerepos", "git"]);

const assessItem = (
  item: ExtensionListItem,
  filter: Exclude<ExtensionListFilter, "all">,
  record: AcceptedEntry | undefined,
) =>
  Effect.gen(function* () {
    if (!item.installed) return { state: "not-applicable" } satisfies ExtensionAssessment;
    if (record === undefined) {
      return {
        state: "unknown",
        reason: "Installed extension has no accepted external resolution",
      } satisfies ExtensionAssessment;
    }
    if (record.type === "registry") return yield* registryAssessment(item, filter, record);
    if (filter === "outdated" && gitAuthorities.has(record.type)) {
      return yield* gitAssessment(item, record);
    }
    return { state: "not-applicable" } satisfies ExtensionAssessment;
  });

export const assessExtensionListItems = Effect.fn("Workspace.assessExtensionListItems")(function* (
  items: ReadonlyArray<ExtensionListItem>,
  filter: Exclude<ExtensionListFilter, "all">,
) {
  const ws = yield* WorkspaceMutations;
  return yield* Effect.forEach(
    items,
    (item) => {
      return getAcceptedEntry(ws, item.type, item.name).pipe(
        Effect.flatMap((accepted) => assessItem(item, filter, Option.getOrUndefined(accepted))),
        Effect.map((assessment): ExtensionListItem => ({ ...item, assessment })),
      );
    },
    { concurrency: 6 },
  );
});

/**
 * Per-type currency collectors and aggregator.
 *
 * Reads configured and locked entries from the WorkspaceMutations service, filters to
 * enabled registry-sourced entries, fetches each extension's index from
 * RegistryClient, and produces an array of ExtensionCurrencyEntry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Record from "effect/Record";
import type * as Scope from "effect/Scope";

import type { AppError } from "../../app-error/index.js";
import type { ExtensionName, ExtensionType } from "../../extensions/index.js";
import { parseRegistrySourcePatternParts } from "../../extensions/registry-source.js";
import { isConfiguredEntryEnabled, toExtensionTypePlural } from "../../extensions/index.js";
import type { RegistryClient } from "../../registry/client.js";
import { resolveSource, SourceHostProviders } from "../../source-resolution/index.js";
import type { SkillExtensionRef } from "../../skills/index.js";
import type { Version, VersionRange } from "../../version-constraints/version-constraints.js";
import type { Handle } from "../../extensions/handle.js";
import { WorkspaceMutations } from "../service-interface.js";
import { checkCurrency, type CurrencyResult } from "./check-currency.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Currency assessment for a single installed extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionCurrencyEntry {
  readonly kind: "registry-version";
  /** Fully-qualified name: `@owner/type/name`. */
  readonly ref: string;
  readonly type: ExtensionType;
  readonly installedVersion: Version;
  readonly constraint: Option.Option<VersionRange>;
  readonly currency: CurrencyResult;
}

/**
 * Source freshness assessment for a Git-hosted extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionSourceFreshnessEntry {
  readonly kind: "source-freshness";
  readonly ref: string;
  readonly type: ExtensionType;
  readonly source: string;
  readonly installedTreeHash: Option.Option<string>;
  readonly currentTreeHash: Option.Option<string>;
  readonly status: "current" | "changed" | "unknown";
  readonly reason: Option.Option<string>;
}

export type ExtensionUpdateEntry = ExtensionCurrencyEntry | ExtensionSourceFreshnessEntry;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a version constraint from a settings source string like `@acme/skills/code-review@^1.0.0`.
 */
const parseConstraintFromSource = (source: string): Option.Option<VersionRange> => {
  const parts = parseRegistrySourcePatternParts(source);
  if (parts === undefined) return Option.none();
  return Option.fromUndefinedOr(parts.versionRange);
};

/** Build fully-qualified ref like `@acme/skills/code-review`. */
const buildFqn = (ownerHandle: Handle, type: ExtensionType, name: ExtensionName): string =>
  `${ownerHandle}/${toExtensionTypePlural(type)}/${name}`;

// ---------------------------------------------------------------------------
// Generic collector
// ---------------------------------------------------------------------------

/**
 * Minimal shape shared by all registry-type lock entries.
 * Used to extract owner/name/version without requiring a specific union member.
 */
interface RegistryLockFields {
  readonly type: "registry";
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly resolvedVersion: Version;
}

interface ConfiguredEntryWithEnabled {
  readonly source: string;
  readonly enabled: boolean;
}

interface ConfiguredEntryWithoutEnabled {
  readonly source: string;
}

type AnyConfiguredEntry = ConfiguredEntryWithEnabled | ConfiguredEntryWithoutEnabled;

/** Type guard for registry lock entries. */
const isRegistryLock = (lock: { readonly type: string }): lock is RegistryLockFields =>
  lock.type === "registry";

/**
 * Generic collector: given accessors for configured and locked entries, produce
 * currency entries for all enabled, registry-sourced extensions of the given type.
 */
const collectCurrency = <
  TConfigured extends AnyConfiguredEntry,
  TLock extends { readonly type: string },
>(
  extensionType: ExtensionType,
  getConfigured: () => Effect.Effect<Record.ReadonlyRecord<string, TConfigured>, AppError>,
  getLocked: () => Effect.Effect<Record.ReadonlyRecord<string, TLock>, AppError>,
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const configured = yield* getConfigured();
    const locked = yield* getLocked();

    // Pre-filter to enabled, registry-sourced entries with lock data
    const eligible = Object.entries(configured).flatMap(([localName, configEntry]) => {
      if ("enabled" in configEntry && !isConfiguredEntryEnabled(configEntry)) return [];
      const lockEntry = locked[localName];
      if (lockEntry === undefined) return [];
      if (!isRegistryLock(lockEntry)) return [];
      return [{ configEntry, lockEntry }];
    });

    // Fetch indices and check currency in parallel
    return yield* Effect.forEach(
      eligible,
      ({ configEntry, lockEntry }) =>
        Effect.gen(function* () {
          const constraint = parseConstraintFromSource(configEntry.source);
          const indexOption = yield* client.getExtensionIndex({
            owner: lockEntry.owner,
            type: extensionType,
            name: lockEntry.name,
          });
          if (Option.isNone(indexOption)) return Option.none();
          const currency = checkCurrency(lockEntry.resolvedVersion, constraint, indexOption.value);
          return Option.some({
            kind: "registry-version",
            ref: buildFqn(lockEntry.owner, extensionType, lockEntry.name),
            type: extensionType,
            installedVersion: lockEntry.resolvedVersion,
            constraint,
            currency,
          } satisfies ExtensionCurrencyEntry);
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map(Array.getSomes));
  });

// ---------------------------------------------------------------------------
// Git-hosted freshness collectors
// ---------------------------------------------------------------------------

interface GitHostedLockFields {
  readonly type: "github" | "gitlab" | "bitbucket" | "azurerepos" | "git";
  readonly gitTreeHash?: string;
}

const isGitHostedLock = (lock: { readonly type: string }): lock is GitHostedLockFields =>
  lock.type === "github" ||
  lock.type === "gitlab" ||
  lock.type === "bitbucket" ||
  lock.type === "azurerepos" ||
  lock.type === "git";

const sourceFreshnessStatus = (
  installedTreeHash: Option.Option<string>,
  currentTreeHash: Option.Option<string>,
): ExtensionSourceFreshnessEntry["status"] => {
  if (Option.isNone(installedTreeHash) || Option.isNone(currentTreeHash)) return "unknown";
  return installedTreeHash.value === currentTreeHash.value ? "current" : "changed";
};

const freshnessEntry = ({
  localName,
  extensionType,
  source,
  installedTreeHash,
  currentTreeHash,
  reason,
}: {
  readonly localName: string;
  readonly extensionType: ExtensionType;
  readonly source: string;
  readonly installedTreeHash: Option.Option<string>;
  readonly currentTreeHash: Option.Option<string>;
  readonly reason: Option.Option<string>;
}): ExtensionSourceFreshnessEntry => ({
  kind: "source-freshness",
  ref: `${toExtensionTypePlural(extensionType)}/${localName}`,
  type: extensionType,
  source,
  installedTreeHash,
  currentTreeHash,
  status: Option.isSome(reason)
    ? "unknown"
    : sourceFreshnessStatus(installedTreeHash, currentTreeHash),
  reason,
});

const findMatchingSkillRef = (
  refs: ReadonlyArray<unknown>,
  localName: string,
): Option.Option<Extract<SkillExtensionRef, { readonly refType: "git-hosted" }>> =>
  Option.fromUndefinedOr(
    refs.find(
      (ref): ref is Extract<SkillExtensionRef, { readonly refType: "git-hosted" }> =>
        typeof ref === "object" &&
        ref !== null &&
        "type" in ref &&
        ref.type === "skill" &&
        "refType" in ref &&
        ref.refType === "git-hosted" &&
        "skill" in ref &&
        typeof ref.skill === "object" &&
        ref.skill !== null &&
        "name" in ref.skill &&
        ref.skill.name === localName,
    ),
  );

export const collectSkillSourceFreshness = (): Effect.Effect<
  ReadonlyArray<ExtensionSourceFreshnessEntry>,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | SourceHostProviders | Scope.Scope
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const providers = yield* SourceHostProviders;
    const configured = yield* ws.records.getConfiguredSkills();
    const locked = yield* ws.getLockedSkills();

    const eligible = Object.entries(configured).flatMap(([localName, configEntry]) => {
      if ("enabled" in configEntry && !isConfiguredEntryEnabled(configEntry)) return [];
      const lockEntry = locked[localName];
      if (lockEntry === undefined || !isGitHostedLock(lockEntry)) return [];
      return [{ localName, configEntry, lockEntry }];
    });

    return yield* Effect.forEach(
      eligible,
      ({ localName, configEntry, lockEntry }) =>
        Effect.gen(function* () {
          const installedTreeHash = Option.fromUndefinedOr(lockEntry.gitTreeHash);
          const sourceResult = yield* resolveSource(configEntry.source).pipe(Effect.result);
          if (sourceResult._tag === "Failure") {
            return freshnessEntry({
              localName,
              extensionType: "skill",
              source: configEntry.source,
              installedTreeHash,
              currentTreeHash: Option.none(),
              reason: Option.some(sourceResult.failure.detail),
            });
          }

          const refsResult = yield* providers
            .find(sourceResult.success, {
              names: [localName],
              type: "skill",
              owner: Option.none(),
              versionRange: Option.none(),
            })
            .pipe(Effect.result);

          if (refsResult._tag === "Failure") {
            return freshnessEntry({
              localName,
              extensionType: "skill",
              source: configEntry.source,
              installedTreeHash,
              currentTreeHash: Option.none(),
              reason: Option.some(refsResult.failure.detail),
            });
          }

          const matchingRef = findMatchingSkillRef(refsResult.success, localName);
          const currentTreeHash = Option.flatMap(matchingRef, (ref) => ref.gitTreeSha);
          return freshnessEntry({
            localName,
            extensionType: "skill",
            source: configEntry.source,
            installedTreeHash,
            currentTreeHash,
            reason: Option.none(),
          });
        }),
      { concurrency: "unbounded" },
    );
  });

// ---------------------------------------------------------------------------
// Per-type collectors
// ---------------------------------------------------------------------------

/**
 * Collect currency entries for all enabled, registry-sourced skills.
 */
export const collectSkillCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency(
      "skill",
      ws.records.getConfiguredSkills,
      ws.getLockedSkills,
      client,
    );
  });

/**
 * Collect currency entries for all enabled, registry-sourced commands.
 */
export const collectCommandCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency(
      "command",
      ws.records.getConfiguredCommands,
      ws.getLockedCommands,
      client,
    );
  });

/**
 * Collect currency entries for all registry-sourced MCP servers.
 */
export const collectMcpServerCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency(
      "mcp-server",
      ws.records.getConfiguredMcpServers,
      ws.getLockedMcpServers,
      client,
    );
  });

/**
 * Collect currency entries for all enabled, registry-sourced subagents.
 */
export const collectSubagentCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency(
      "subagent",
      ws.records.getConfiguredSubagents,
      ws.getLockedSubagents,
      client,
    );
  });

/**
 * Collect currency entries for all registry-sourced packs.
 */
export const collectPackCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency("pack", ws.records.getConfiguredPacks, ws.getLockedPacks, client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced Context Files packages.
 */
export const collectFilesCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency("files", ws.getConfiguredFilesEntries, ws.getLockedFiles, client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced rules.
 */
export const collectRuleCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency("rule", ws.getConfiguredRuleEntries, ws.getLockedRules, client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced hooks.
 */
export const collectHookCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency("hook", ws.getConfiguredHookEntries, ws.getLockedHooks, client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced knowledge bundles.
 */
export const collectKnowledgeCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    return yield* collectCurrency(
      "knowledge",
      ws.getConfiguredKnowledgeEntries,
      ws.getLockedKnowledge,
      client,
    );
  });

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Collect currency entries for all extension types and merge into a single array.
 */
export const collectAllCurrencyEntries = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const [skills, commands, mcpServers, subagents, packs, files, rules, hooks, knowledge] =
      yield* Effect.all(
        [
          collectSkillCurrency(client),
          collectCommandCurrency(client),
          collectMcpServerCurrency(client),
          collectSubagentCurrency(client),
          collectPackCurrency(client),
          collectFilesCurrency(client),
          collectRuleCurrency(client),
          collectHookCurrency(client),
          collectKnowledgeCurrency(client),
        ],
        { concurrency: "unbounded" },
      );

    return [
      ...skills,
      ...commands,
      ...mcpServers,
      ...subagents,
      ...packs,
      ...files,
      ...rules,
      ...hooks,
      ...knowledge,
    ];
  });

export const collectAllUpdateEntries = (
  client: RegistryClient,
): Effect.Effect<
  ReadonlyArray<ExtensionUpdateEntry>,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | SourceHostProviders | Scope.Scope
> =>
  Effect.gen(function* () {
    const [currencyEntries, sourceFreshnessEntries] = yield* Effect.all(
      [collectAllCurrencyEntries(client), collectSkillSourceFreshness()],
      { concurrency: "unbounded" },
    );

    return [...currencyEntries, ...sourceFreshnessEntries];
  });

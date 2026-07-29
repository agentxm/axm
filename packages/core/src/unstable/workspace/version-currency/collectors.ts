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
import type {
  ExtensionName,
  ExtensionRef,
  ExtensionType,
  PerAgentType,
} from "../../extensions/index.js";
import { parseRegistrySourcePatternParts } from "../../extensions/registry-source.js";
import { isConfiguredEntryEnabled, toExtensionTypePlural } from "../../extensions/index.js";
import type { RegistryClient } from "../../registry/client.js";
import { resolveSource, SourceHostProviders } from "../../source-resolution/index.js";
import type { Version, VersionRange } from "../../version-constraints/version-constraints.js";
import type { Handle } from "../../extensions/handle.js";
import { WorkspaceMutations, type WorkspaceMutationsService } from "../service-interface.js";
import { checkCurrency, type CurrencyResult } from "./check-currency.js";
import { configuredRowsByName } from "../read-model-record-rows.js";

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

type GitHostedExtensionRef = Extract<ExtensionRef, { readonly refType: "git-hosted" }>;

/**
 * The workspace-facing name a discovered ref carries.
 *
 * Each type nests its payload under its own key; a returning switch keeps a new
 * extension type from silently never matching.
 */
const refExtensionName = (ref: GitHostedExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "command":
      return ref.command.name;
    case "mcp-server":
      return ref.server.name;
    case "subagent":
      return ref.subagent.name;
    case "files":
      return ref.file.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
  }
};

const matchingRefTreeSha = (
  refs: ReadonlyArray<ExtensionRef>,
  extensionType: ExtensionType,
  localName: string,
): Option.Option<string> => {
  const match = refs.find(
    (ref): ref is GitHostedExtensionRef =>
      ref.refType === "git-hosted" &&
      ref.type === extensionType &&
      refExtensionName(ref) === localName,
  );
  return match === undefined ? Option.none() : match.gitTreeSha;
};

/** Configured entry shape every type shares for freshness purposes. */
interface FreshnessConfiguredEntry {
  readonly source: string;
  readonly enabled?: boolean;
}

/** Lock entry shape every type shares for freshness purposes. */
interface FreshnessLockEntry {
  readonly type: string;
  readonly gitTreeHash?: string | undefined;
}

/**
 * Compare each git-sourced entry's recorded tree hash against the source's
 * current tree hash.
 *
 * Registry, local, workspace, and inline entries carry no upstream git tree to
 * compare and are skipped by `isGitHostedLock`.
 */
const collectSourceFreshness = (args: {
  readonly extensionType: ExtensionType;
  readonly configured: Readonly<Record<string, FreshnessConfiguredEntry>>;
  readonly locked: Readonly<Record<string, FreshnessLockEntry>>;
}): Effect.Effect<
  ReadonlyArray<ExtensionSourceFreshnessEntry>,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | SourceHostProviders | Scope.Scope
> =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const { extensionType, configured, locked } = args;

    const eligible = Object.entries(configured).flatMap(([localName, configEntry]) => {
      if (configEntry.enabled === false) return [];
      const lockEntry = locked[localName];
      if (lockEntry === undefined || !isGitHostedLock(lockEntry)) return [];
      return [{ localName, configEntry, lockEntry }];
    });

    return yield* Effect.forEach(
      eligible,
      ({ localName, configEntry, lockEntry }) =>
        Effect.gen(function* () {
          const installedTreeHash = Option.fromUndefinedOr(lockEntry.gitTreeHash);
          const unresolved = (reason: string): ExtensionSourceFreshnessEntry =>
            freshnessEntry({
              localName,
              extensionType,
              source: configEntry.source,
              installedTreeHash,
              currentTreeHash: Option.none(),
              reason: Option.some(reason),
            });

          const sourceResult = yield* resolveSource(configEntry.source).pipe(Effect.result);
          if (sourceResult._tag === "Failure") {
            return unresolved(sourceResult.failure.detail);
          }

          const refsResult = yield* providers
            .find(sourceResult.success, {
              names: [localName],
              type: extensionType,
              owner: Option.none(),
              versionRange: Option.none(),
            })
            .pipe(Effect.result);

          if (refsResult._tag === "Failure") {
            return unresolved(refsResult.failure.detail);
          }

          return freshnessEntry({
            localName,
            extensionType,
            source: configEntry.source,
            installedTreeHash,
            currentTreeHash: matchingRefTreeSha(refsResult.success, extensionType, localName),
            reason: Option.none(),
          });
        }),
      { concurrency: "unbounded" },
    );
  });

type SourceFreshnessCollector = () => Effect.Effect<
  ReadonlyArray<ExtensionSourceFreshnessEntry>,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | SourceHostProviders | Scope.Scope
>;

const makeRecordSourceFreshnessCollector =
  (
    extensionType: PerAgentType,
    getLocked: (
      ws: WorkspaceMutationsService,
    ) => Effect.Effect<Readonly<Record<string, FreshnessLockEntry>>, AppError>,
  ): SourceFreshnessCollector =>
  () =>
    Effect.gen(function* () {
      const ws = yield* WorkspaceMutations;
      const configured = yield* ws.records
        .rows(extensionType)
        .pipe(Effect.map(configuredRowsByName));
      const locked = yield* getLocked(ws);
      return yield* collectSourceFreshness({ extensionType, configured, locked });
    });

const makeConfiguredSourceFreshnessCollector =
  (
    extensionType: ExtensionType,
    getConfigured: (
      ws: WorkspaceMutationsService,
    ) => Effect.Effect<Readonly<Record<string, FreshnessConfiguredEntry>>, AppError>,
    getLocked: (
      ws: WorkspaceMutationsService,
    ) => Effect.Effect<Readonly<Record<string, FreshnessLockEntry>>, AppError>,
  ): SourceFreshnessCollector =>
  () =>
    Effect.gen(function* () {
      const ws = yield* WorkspaceMutations;
      const configured = yield* getConfigured(ws);
      const locked = yield* getLocked(ws);
      return yield* collectSourceFreshness({ extensionType, configured, locked });
    });

export const collectSkillSourceFreshness: SourceFreshnessCollector =
  makeRecordSourceFreshnessCollector("skill", (ws) => ws.getLockedSkills());

export const collectCommandSourceFreshness: SourceFreshnessCollector =
  makeRecordSourceFreshnessCollector("command", (ws) => ws.getLockedCommands());

export const collectMcpServerSourceFreshness: SourceFreshnessCollector =
  makeRecordSourceFreshnessCollector("mcp-server", (ws) => ws.getLockedMcpServers());

export const collectSubagentSourceFreshness: SourceFreshnessCollector =
  makeRecordSourceFreshnessCollector("subagent", (ws) => ws.getLockedSubagents());

export const collectFilesSourceFreshness: SourceFreshnessCollector =
  makeConfiguredSourceFreshnessCollector(
    "files",
    (ws) => ws.getConfiguredFilesEntries(),
    (ws) => ws.getLockedFiles(),
  );

export const collectRuleSourceFreshness: SourceFreshnessCollector =
  makeConfiguredSourceFreshnessCollector(
    "rule",
    (ws) => ws.getConfiguredRuleEntries(),
    (ws) => ws.getLockedRules(),
  );

export const collectHookSourceFreshness: SourceFreshnessCollector =
  makeConfiguredSourceFreshnessCollector(
    "hook",
    (ws) => ws.getConfiguredHookEntries(),
    (ws) => ws.getLockedHooks(),
  );

export const collectKnowledgeSourceFreshness: SourceFreshnessCollector =
  makeConfiguredSourceFreshnessCollector(
    "knowledge",
    (ws) => ws.getConfiguredKnowledgeEntries(),
    (ws) => ws.getLockedKnowledge(),
  );

/** Every per-type git-source freshness collector, in catalog order. */
export const sourceFreshnessCollectors: ReadonlyArray<SourceFreshnessCollector> = [
  collectSkillSourceFreshness,
  collectCommandSourceFreshness,
  collectMcpServerSourceFreshness,
  collectSubagentSourceFreshness,
  collectFilesSourceFreshness,
  collectRuleSourceFreshness,
  collectHookSourceFreshness,
  collectKnowledgeSourceFreshness,
];

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
      () => ws.records.rows("skill").pipe(Effect.map(configuredRowsByName)),
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
      () => ws.records.rows("command").pipe(Effect.map(configuredRowsByName)),
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
      () => ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName)),
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
      () => ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName)),
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
    return yield* collectCurrency(
      "pack",
      () => ws.records.rows("pack").pipe(Effect.map(configuredRowsByName)),
      ws.getLockedPacks,
      client,
    );
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
    const [currencyEntries, freshnessByType] = yield* Effect.all(
      [
        collectAllCurrencyEntries(client),
        Effect.forEach(sourceFreshnessCollectors, (collect) => collect(), {
          concurrency: "unbounded",
        }),
      ],
      { concurrency: "unbounded" },
    );

    return [...currencyEntries, ...freshnessByType.flat()];
  });

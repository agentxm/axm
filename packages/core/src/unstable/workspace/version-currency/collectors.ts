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
import * as Option from "effect/Option";
import * as Record from "effect/Record";

import type { AppError } from "../../app-error/index.js";
import type { ExtensionName, ExtensionType } from "../../extensions/index.js";
import { parseRegistrySourcePatternParts } from "../../extensions/registry-source.js";
import { toExtensionTypePlural } from "../../extensions/index.js";
import type { RegistryClient } from "../../registry/client.js";
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
  /** Fully-qualified name: `@owner/type/name`. */
  readonly ref: string;
  readonly type: ExtensionType;
  readonly installedVersion: Version;
  readonly constraint: Option.Option<VersionRange>;
  readonly currency: CurrencyResult;
}

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

const isEnabled = (entry: AnyConfiguredEntry): boolean =>
  "enabled" in entry ? entry.enabled : true;

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
      if (!isEnabled(configEntry)) return [];
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
    return yield* collectCurrency(
      "pack",
      ws.records.getConfiguredPacks,
      ws.getLockedExtensionPacks,
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
    const [skills, commands, mcpServers, subagents, packs] = yield* Effect.all(
      [
        collectSkillCurrency(client),
        collectCommandCurrency(client),
        collectMcpServerCurrency(client),
        collectSubagentCurrency(client),
        collectPackCurrency(client),
      ],
      { concurrency: "unbounded" },
    );

    return [...skills, ...commands, ...mcpServers, ...subagents, ...packs];
  });

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
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import { makeAppError, type AppError } from "../../app-error/index.js";
import type { ExtensionName, ExtensionRef, ExtensionType } from "../../extensions/index.js";
import {
  parseExtensionFqnParts,
  parseRegistrySourcePatternParts,
  toExtensionTypePlural,
} from "../../extensions/index.js";
import type { RegistryClient } from "../../registry/client.js";
import { resolveSource, SourceHostProviders } from "../../source-resolution/index.js";
import {
  VersionSchema,
  type Version,
  type VersionRange,
} from "../../version-constraints/version-constraints.js";
import type { Handle } from "../../extensions/handle.js";
import { trustRecordKey } from "../../trust/index.js";
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
 * Collect currency from desired state and the security trust baseline. Receipts
 * are deliberately excluded: update eligibility and currentness must be stable
 * when optional history is missing, stale, or corrupt.
 */
const collectCurrency = (
  extensionType: ExtensionType,
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph();
    if (!graph.complete) {
      return yield* makeAppError({
        code: "validation",
        detail: "Cannot assess extension currency while the desired pack graph is incomplete",
      });
    }
    const trust = yield* ws.getTrustState();
    const eligible = graph.nodes.flatMap((node) => {
      if (node.type !== extensionType || !node.enabled) return [];
      const record = trust.records[trustRecordKey(node.type, node.name)];
      if (
        record === undefined ||
        record.authority !== "registry" ||
        record.resolvedVersion === undefined
      ) {
        return [];
      }
      const identity = parseExtensionFqnParts(record.sourceIdentity);
      if (identity === undefined || identity.type !== extensionType) return [];
      return [{ node, record, identity }];
    });

    return yield* Effect.forEach(
      eligible,
      ({ node, record, identity }) =>
        Effect.gen(function* () {
          const installedVersion = yield* Schema.decodeUnknownEffect(VersionSchema)(
            record.resolvedVersion,
          ).pipe(
            Effect.mapError(() =>
              makeAppError({
                code: "validation",
                detail: `Trusted version for ${node.type} "${node.name}" is invalid`,
              }),
            ),
          );
          const constraint = parseConstraintFromSource(node.source);
          const indexOption = yield* client.getExtensionIndex({
            owner: identity.owner,
            type: extensionType,
            name: identity.name,
          });
          if (Option.isNone(indexOption)) return Option.none();
          const currency = checkCurrency(installedVersion, constraint, indexOption.value);
          return Option.some({
            kind: "registry-version",
            ref: buildFqn(identity.owner, extensionType, identity.name),
            type: extensionType,
            installedVersion,
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

const gitAuthorities = new Set(["github", "gitlab", "bitbucket", "azurerepos", "git"]);

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

/**
 * Compare desired Git-hosted entries against their trusted immutable revision.
 * Receipt history is deliberately excluded from eligibility and currentness.
 */
const collectSourceFreshness = (args: {
  readonly extensionType: ExtensionType;
}): Effect.Effect<
  ReadonlyArray<ExtensionSourceFreshnessEntry>,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | SourceHostProviders | Scope.Scope
> =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const ws = yield* WorkspaceMutations;
    const { extensionType } = args;
    const graph = yield* ws.getDesiredStateGraph();
    if (!graph.complete) {
      return yield* makeAppError({
        code: "validation",
        detail: "Cannot assess source freshness while the desired pack graph is incomplete",
      });
    }
    const trust = yield* ws.getTrustState();
    const eligible = graph.nodes.flatMap((node) => {
      if (node.type !== extensionType || !node.enabled) return [];
      const record = trust.records[trustRecordKey(node.type, node.name)];
      if (record === undefined || !gitAuthorities.has(record.authority)) return [];
      return [{ node, record }];
    });

    return yield* Effect.forEach(
      eligible,
      ({ node, record }) =>
        Effect.gen(function* () {
          const installedTreeHash = Option.fromUndefinedOr(record.immutableRevision);
          const unresolved = (reason: string): ExtensionSourceFreshnessEntry =>
            freshnessEntry({
              localName: node.name,
              extensionType,
              source: node.source,
              installedTreeHash,
              currentTreeHash: Option.none(),
              reason: Option.some(reason),
            });

          const sourceResult = yield* resolveSource(node.source).pipe(Effect.result);
          if (sourceResult._tag === "Failure") {
            return unresolved(sourceResult.failure.detail);
          }

          const refsResult = yield* providers
            .find(sourceResult.success, {
              names: [node.name],
              type: extensionType,
              owner: Option.none(),
              versionRange: Option.none(),
            })
            .pipe(Effect.result);

          if (refsResult._tag === "Failure") {
            return unresolved(refsResult.failure.detail);
          }

          return freshnessEntry({
            localName: node.name,
            extensionType,
            source: node.source,
            installedTreeHash,
            currentTreeHash: matchingRefTreeSha(refsResult.success, extensionType, node.name),
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

const makeSourceFreshnessCollector =
  (extensionType: ExtensionType): SourceFreshnessCollector =>
  () =>
    collectSourceFreshness({ extensionType });

export const collectSkillSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("skill");

export const collectCommandSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("command");

export const collectMcpServerSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("mcp-server");

export const collectSubagentSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("subagent");

export const collectFilesSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("files");

export const collectRuleSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("rule");

export const collectHookSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("hook");

export const collectKnowledgeSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("knowledge");

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
    return yield* collectCurrency("skill", client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced commands.
 */
export const collectCommandCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("command", client);
  });

/**
 * Collect currency entries for all registry-sourced MCP servers.
 */
export const collectMcpServerCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("mcp-server", client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced subagents.
 */
export const collectSubagentCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("subagent", client);
  });

/**
 * Collect currency entries for all registry-sourced packs.
 */
export const collectPackCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("pack", client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced Context Files packages.
 */
export const collectFilesCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("files", client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced rules.
 */
export const collectRuleCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("rule", client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced hooks.
 */
export const collectHookCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("hook", client);
  });

/**
 * Collect currency entries for all enabled, registry-sourced knowledge bundles.
 */
export const collectKnowledgeCurrency = (
  client: RegistryClient,
): Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    return yield* collectCurrency("knowledge", client);
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

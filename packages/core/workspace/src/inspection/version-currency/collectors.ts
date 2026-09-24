/**
 * Per-type currency collectors and aggregator.
 *
 * Reads desired state and accepted resolutions, filters to
 * enabled registry-sourced entries, fetches each extension's index from
 * RegistryClient, and produces an array of ExtensionCurrencyEntry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ExtensionName, ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { RegistryClient } from "@agentxm/registry-client";
import { resolveSource, SourceHostProviders } from "../../resolution/sources/index.js";
import {
  VersionSchema,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { AcceptedExtensionResolution } from "../../desired-state/index.js";
import { DesiredStateReader, LockfileReader } from "../../desired-state/index.js";
import { isSourcedDesiredExtension } from "../../desired-state/index.js";
import { checkCurrency, type CurrencyResult } from "./check-currency.js";
import { WorkspaceInspectionFailed } from "../errors.js";
import { describeInspectionFailure } from "../describe-failure.js";

// Registry currency reads share the same four-request transport cap used by
// publishing. Git source probes stay serial because each provider may allocate
// a clone/worktree and no higher subprocess capacity has been established.
const REGISTRY_READ_CONCURRENCY = 4;
const SOURCE_FRESHNESS_CONCURRENCY = 1;

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
  const parts = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (parts === undefined) return Option.none();
  return Option.fromUndefinedOr(parts.versionRange);
};

/** Build fully-qualified ref like `@acme/skills/code-review`. */
const buildFqn = (ownerHandle: Handle, type: ExtensionType, name: ExtensionName): string =>
  `${ownerHandle}/${toExtensionTypePlural(type)}/${name}`;

type AcceptedResolution = AcceptedExtensionResolution;

type GitAcceptedResolution = Extract<
  AcceptedResolution,
  { readonly source: { readonly type: "git" } }
>;
type RegistryAcceptedResolution = Extract<
  AcceptedResolution,
  { readonly source: { readonly type: "registry" } }
>;

const isGitAcceptedResolution = (entry: AcceptedResolution): entry is GitAcceptedResolution =>
  entry.source.type === "git";

const isRegistryAcceptedResolution = (
  entry: AcceptedResolution,
): entry is RegistryAcceptedResolution => entry.source.type === "registry";

// ---------------------------------------------------------------------------
// Generic collector
// ---------------------------------------------------------------------------

/**
 * Collect currency from desired state and accepted Registry resolutions.
 */
const collectCurrency = (extensionType: ExtensionType, client: RegistryClient) =>
  Effect.gen(function* () {
    const desiredState = yield* DesiredStateReader;
    const lockfile = yield* LockfileReader;
    const graph = yield* desiredState.graph();
    if (!graph.complete) {
      return yield* new WorkspaceInspectionFailed({
        category: "validation",
        detail:
          "Cannot check for extension updates because some pack manifests are missing or invalid",
      });
    }
    const accepted = yield* Effect.forEach(
      graph.nodes
        .filter(isSourcedDesiredExtension)
        .filter((node) => node.type === extensionType && node.enabled),
      (node) =>
        lockfile
          .acceptedEntry(node.type, node.name)
          .pipe(Effect.map((resolution) => ({ node, resolution }))),
    );
    const eligible = accepted.flatMap(({ node, resolution }) =>
      Option.isSome(resolution) && isRegistryAcceptedResolution(resolution.value)
        ? [{ node, resolution: resolution.value }]
        : [],
    );

    return yield* Effect.forEach(
      eligible,
      ({ node, resolution }) =>
        Effect.gen(function* () {
          const installedVersion = yield* Schema.decodeUnknownEffect(VersionSchema)(
            resolution.resolved.version,
          ).pipe(
            Effect.mapError(
              () =>
                new WorkspaceInspectionFailed({
                  category: "validation",
                  detail: `Accepted version for ${node.type} "${node.name}" is invalid`,
                }),
            ),
          );
          const constraint = parseConstraintFromSource(node.source);
          const indexOption = yield* client.getExtensionIndex({
            owner: resolution.identity.owner,
            type: extensionType,
            name: resolution.identity.name,
          });
          if (Option.isNone(indexOption)) return Option.none();
          const currency = checkCurrency(installedVersion, constraint, indexOption.value);
          return Option.some({
            kind: "registry-version",
            ref: buildFqn(resolution.identity.owner, extensionType, resolution.identity.name),
            type: extensionType,
            installedVersion,
            constraint,
            currency,
          } satisfies ExtensionCurrencyEntry);
        }),
      { concurrency: REGISTRY_READ_CONCURRENCY },
    ).pipe(Effect.map(Array.getSomes));
  });

// ---------------------------------------------------------------------------
// Git-hosted freshness collectors
// ---------------------------------------------------------------------------

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
  return match === undefined ? Option.none() : Option.some(match.gitTreeSha);
};

/**
 * Compare desired Git-hosted entries against their accepted immutable revision.
 */
const collectSourceFreshness = (args: { readonly extensionType: ExtensionType }) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const desiredState = yield* DesiredStateReader;
    const lockfile = yield* LockfileReader;
    const { extensionType } = args;
    const graph = yield* desiredState.graph();
    if (!graph.complete) {
      return yield* new WorkspaceInspectionFailed({
        category: "validation",
        detail: "Cannot check source freshness because some pack manifests are missing or invalid",
      });
    }
    const accepted = yield* Effect.forEach(
      graph.nodes
        .filter(isSourcedDesiredExtension)
        .filter((node) => node.type === extensionType && node.enabled),
      (node) =>
        lockfile
          .acceptedEntry(node.type, node.name)
          .pipe(Effect.map((resolution) => ({ node, resolution }))),
    );
    const eligible = accepted.flatMap(({ node, resolution }) =>
      Option.isSome(resolution) && isGitAcceptedResolution(resolution.value)
        ? [{ node, resolution: resolution.value }]
        : [],
    );

    return yield* Effect.forEach(
      eligible,
      ({ node, resolution }) =>
        Effect.gen(function* () {
          const installedTreeHash = Option.some(resolution.resolved.tree);
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
            return unresolved(describeInspectionFailure(sourceResult.failure));
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
            return unresolved(describeInspectionFailure(refsResult.failure));
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
      { concurrency: SOURCE_FRESHNESS_CONCURRENCY },
    );
  });

type SourceFreshnessCollector = () => ReturnType<typeof collectSourceFreshness>;

const makeSourceFreshnessCollector =
  (extensionType: ExtensionType): SourceFreshnessCollector =>
  () =>
    collectSourceFreshness({ extensionType });

export const collectSkillSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("skill");

export const collectMcpServerSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("mcp-server");

export const collectSubagentSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("subagent");

export const collectRuleSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("rule");

export const collectHookSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("hook");

export const collectKnowledgeSourceFreshness: SourceFreshnessCollector =
  makeSourceFreshnessCollector("knowledge");

/** Every per-type git-source freshness collector, in catalog order. */
export const sourceFreshnessCollectors: ReadonlyArray<SourceFreshnessCollector> = [
  collectSkillSourceFreshness,
  collectMcpServerSourceFreshness,
  collectSubagentSourceFreshness,
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
export const collectSkillCurrency = (client: RegistryClient) => collectCurrency("skill", client);

/**
 * Collect currency entries for all registry-sourced MCP servers.
 */
export const collectMcpServerCurrency = (client: RegistryClient) =>
  collectCurrency("mcp-server", client);

/**
 * Collect currency entries for all enabled, registry-sourced subagents.
 */
export const collectSubagentCurrency = (client: RegistryClient) =>
  collectCurrency("subagent", client);

/**
 * Collect currency entries for all registry-sourced packs.
 */
export const collectPackCurrency = (client: RegistryClient) => collectCurrency("pack", client);

/**
 * Collect currency entries for all enabled, registry-sourced rules.
 */
export const collectRuleCurrency = (client: RegistryClient) => collectCurrency("rule", client);

/**
 * Collect currency entries for all enabled, registry-sourced hooks.
 */
export const collectHookCurrency = (client: RegistryClient) => collectCurrency("hook", client);

/**
 * Collect currency entries for all enabled, registry-sourced knowledge bundles.
 */
export const collectKnowledgeCurrency = (client: RegistryClient) =>
  collectCurrency("knowledge", client);

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Collect currency entries for all extension types and merge into a single array.
 */
export const collectAllCurrencyEntries = (client: RegistryClient) =>
  Effect.gen(function* () {
    const [skills, mcpServers, subagents, packs, rules, hooks, knowledge] = yield* Effect.all(
      [
        collectSkillCurrency(client),
        collectMcpServerCurrency(client),
        collectSubagentCurrency(client),
        collectPackCurrency(client),
        collectRuleCurrency(client),
        collectHookCurrency(client),
        collectKnowledgeCurrency(client),
      ],
      { concurrency: SOURCE_FRESHNESS_CONCURRENCY },
    );

    return [...skills, ...mcpServers, ...subagents, ...packs, ...rules, ...hooks, ...knowledge];
  });

export const collectAllUpdateEntries = (client: RegistryClient) =>
  Effect.gen(function* () {
    const [currencyEntries, freshnessByType] = yield* Effect.all(
      [
        collectAllCurrencyEntries(client),
        Effect.forEach(sourceFreshnessCollectors, (collect) => collect(), {
          concurrency: SOURCE_FRESHNESS_CONCURRENCY,
        }),
      ],
      { concurrency: SOURCE_FRESHNESS_CONCURRENCY },
    );

    return [...currencyEntries, ...freshnessByType.flat()];
  });

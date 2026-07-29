import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "../../../extensions/common.js";
import type { ExtensionKey } from "../types.js";
import { matchingIgnoredPatterns } from "./ignore-patterns.js";

export const ExtensionInventoryLifecycleSchema = Schema.Literals([
  "configured",
  "implicit",
  "unmanaged",
]);

export type ExtensionInventoryLifecycle = typeof ExtensionInventoryLifecycleSchema.Type;

export const ExtensionInventoryClassificationSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("lifecycle"),
    lifecycle: ExtensionInventoryLifecycleSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("ignored"),
    matchedBy: Schema.Array(Schema.String),
    reasons: Schema.Array(Schema.String),
  }),
]);

export type ExtensionInventoryClassification = typeof ExtensionInventoryClassificationSchema.Type;

export const ExtensionInventoryRowSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"]),
  type: ExtensionTypeSchema,
  name: Schema.String,
  classification: ExtensionInventoryClassificationSchema,
  enabled: Schema.NullOr(Schema.Boolean),
  agents: Schema.Array(Schema.String),
  origins: Schema.Array(Schema.String),
  paths: Schema.Array(Schema.String),
  source: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  owner: Schema.optionalKey(Schema.String),
  transport: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  locked: Schema.optionalKey(Schema.Boolean),
  sourceType: Schema.optionalKey(Schema.String),
});

export type ExtensionInventoryRow = typeof ExtensionInventoryRowSchema.Type;

export const ExtensionInventorySchema = Schema.Struct({
  items: Schema.Array(ExtensionInventoryRowSchema),
  count: Schema.Number,
  configuredCount: Schema.Number,
  implicitCount: Schema.Number,
  installedCount: Schema.Number,
  unmanagedCount: Schema.Number,
  ignoredCount: Schema.Number,
});

export type ExtensionInventory = typeof ExtensionInventorySchema.Type;

export interface ExtensionInventoryObservation {
  readonly agents?: ReadonlyArray<string>;
  readonly origins?: ReadonlyArray<string>;
  readonly paths?: ReadonlyArray<string>;
}

export interface LifecycleInventoryCandidate extends ExtensionInventoryObservation {
  readonly key: ExtensionKey;
  readonly lifecycle: ExtensionInventoryLifecycle;
  readonly enabled: boolean | null;
}

export interface IgnoredInventoryCandidate extends ExtensionInventoryObservation {
  readonly key: ExtensionKey;
  readonly reason: string;
}

export interface ProjectExtensionInventoryInput {
  readonly lifecycle: ReadonlyArray<LifecycleInventoryCandidate>;
  readonly ignored: ReadonlyArray<IgnoredInventoryCandidate>;
  readonly ignoredPatterns: ReadonlySet<string>;
  readonly includeIgnored: boolean;
  readonly agents?: ReadonlyArray<string>;
}

interface MutableInventoryAggregate {
  readonly key: ExtensionKey;
  lifecycle: ExtensionInventoryLifecycle;
  enabled: boolean | null;
  readonly agents: Set<string>;
  readonly origins: Set<string>;
  readonly paths: Set<string>;
}

interface MutableIgnoredAggregate {
  readonly key: ExtensionKey;
  readonly reasons: Set<string>;
  readonly agents: Set<string>;
  readonly origins: Set<string>;
  readonly paths: Set<string>;
}

const lifecyclePriority: Readonly<Record<ExtensionInventoryLifecycle, number>> = {
  configured: 0,
  implicit: 1,
  unmanaged: 2,
};

const keyString = (key: ExtensionKey): string => `${key.scope}:${key.type}:${key.name}`;

const addAll = (target: Set<string>, values: ReadonlyArray<string> | undefined): void => {
  for (const value of values ?? []) target.add(value);
};

const sorted = (values: ReadonlySet<string>): ReadonlyArray<string> =>
  Array.from(values).sort((left, right) => left.localeCompare(right));

const matchesAgentFilter = (
  agents: ReadonlyArray<string>,
  filter: ReadonlyArray<string>,
): boolean => filter.length === 0 || filter.some((agent) => agents.includes(agent));

export const projectExtensionInventory = (
  input: ProjectExtensionInventoryInput,
): ExtensionInventory => {
  const lifecycleByKey = new Map<string, MutableInventoryAggregate>();
  for (const candidate of input.lifecycle) {
    const candidateKey = keyString(candidate.key);
    const existing = lifecycleByKey.get(candidateKey);
    if (existing === undefined) {
      const aggregate: MutableInventoryAggregate = {
        key: candidate.key,
        lifecycle: candidate.lifecycle,
        enabled: candidate.enabled,
        agents: new Set(candidate.agents ?? []),
        origins: new Set(candidate.origins ?? []),
        paths: new Set(candidate.paths ?? []),
      };
      lifecycleByKey.set(candidateKey, aggregate);
      continue;
    }

    if (lifecyclePriority[candidate.lifecycle] < lifecyclePriority[existing.lifecycle]) {
      existing.lifecycle = candidate.lifecycle;
      existing.enabled = candidate.enabled;
    }
    addAll(existing.agents, candidate.agents);
    addAll(existing.origins, candidate.origins);
    addAll(existing.paths, candidate.paths);
  }

  const ignoredByKey = new Map<string, MutableIgnoredAggregate>();
  for (const candidate of input.ignored) {
    const candidateKey = keyString(candidate.key);
    const existing = ignoredByKey.get(candidateKey);
    if (existing === undefined) {
      ignoredByKey.set(candidateKey, {
        key: candidate.key,
        reasons: new Set([candidate.reason]),
        agents: new Set(candidate.agents ?? []),
        origins: new Set(candidate.origins ?? []),
        paths: new Set(candidate.paths ?? []),
      });
      continue;
    }

    existing.reasons.add(candidate.reason);
    addAll(existing.agents, candidate.agents);
    addAll(existing.origins, candidate.origins);
    addAll(existing.paths, candidate.paths);
  }

  const agentFilter = input.agents ?? [];
  const lifecycleRows = Array.from(lifecycleByKey.entries())
    .filter(([candidateKey, aggregate]) => {
      if (ignoredByKey.has(candidateKey)) return false;
      return matchesAgentFilter(sorted(aggregate.agents), agentFilter);
    })
    .map(([, aggregate]): ExtensionInventoryRow => ({
      scope: aggregate.key.scope,
      type: aggregate.key.type,
      name: aggregate.key.name,
      classification: { kind: "lifecycle", lifecycle: aggregate.lifecycle },
      enabled: aggregate.enabled,
      agents: sorted(aggregate.agents),
      origins: sorted(aggregate.origins),
      paths: sorted(aggregate.paths),
    }));

  const ignoredRows = input.includeIgnored
    ? Array.from(ignoredByKey.values())
        .filter((aggregate) => matchesAgentFilter(sorted(aggregate.agents), agentFilter))
        .map((aggregate): ExtensionInventoryRow => ({
          scope: aggregate.key.scope,
          type: aggregate.key.type,
          name: aggregate.key.name,
          classification: {
            kind: "ignored",
            matchedBy: matchingIgnoredPatterns(aggregate.key.name, input.ignoredPatterns),
            reasons: sorted(aggregate.reasons),
          },
          enabled: null,
          agents: sorted(aggregate.agents),
          origins: sorted(aggregate.origins),
          paths: sorted(aggregate.paths),
        }))
    : [];

  const items = [...lifecycleRows, ...ignoredRows].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const configuredCount = items.filter(
    (item) =>
      item.classification.kind === "lifecycle" && item.classification.lifecycle === "configured",
  ).length;
  const implicitCount = items.filter(
    (item) =>
      item.classification.kind === "lifecycle" && item.classification.lifecycle === "implicit",
  ).length;
  const unmanagedCount = items.filter(
    (item) =>
      item.classification.kind === "lifecycle" && item.classification.lifecycle === "unmanaged",
  ).length;
  const ignoredCount = items.filter((item) => item.classification.kind === "ignored").length;

  return {
    items,
    count: items.length,
    configuredCount,
    implicitCount,
    installedCount: configuredCount + implicitCount,
    unmanagedCount,
    ignoredCount,
  };
};

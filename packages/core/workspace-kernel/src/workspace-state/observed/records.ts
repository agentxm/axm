/** Lifecycle record rows: their schema, lifecycle predicates, and aggregation. */

import * as Schema from "effect/Schema";
import type * as Record from "effect/Record";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/common";

/**
 * How desired state explains one detected extension: direct configuration,
 * Pack reachability, an unreachable installed package, undeclared authored
 * content, or native agent content outside AXM ownership.
 */
export const ExtensionInventoryLifecycleSchema = Schema.Literals([
  "configured",
  "implicit",
  "leftover",
  "undeclared",
  "unmanaged",
]);
export type ExtensionInventoryLifecycle = typeof ExtensionInventoryLifecycleSchema.Type;
export const ExtensionInventoryClassificationSchema = Schema.Struct({
  kind: Schema.Literal("lifecycle"),
  lifecycle: ExtensionInventoryLifecycleSchema,
});
export type ExtensionInventoryClassification = typeof ExtensionInventoryClassificationSchema.Type;

export const WorkspaceRecordRowSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"]),
  type: ExtensionTypeSchema,
  name: Schema.String,
  classification: ExtensionInventoryClassificationSchema,
  enabled: Schema.NullOr(Schema.Boolean),
  installed: Schema.Boolean,
  agents: Schema.Array(Schema.String),
  origins: Schema.Array(Schema.String),
  paths: Schema.Array(Schema.String),
  source: Schema.optionalKey(Schema.String),
});

export type WorkspaceRecordRow = typeof WorkspaceRecordRowSchema.Type;
export type ConfiguredRecordRow = WorkspaceRecordRow & {
  readonly classification: { readonly kind: "lifecycle"; readonly lifecycle: "configured" };
  readonly enabled: boolean;
};
export type InstalledRecordRow = WorkspaceRecordRow & {
  readonly classification: {
    readonly kind: "lifecycle";
    readonly lifecycle: "configured" | "implicit";
  };
};
export type UnmanagedRecordRow = WorkspaceRecordRow & {
  readonly classification: {
    readonly kind: "lifecycle";
    readonly lifecycle: "leftover" | "undeclared" | "unmanaged";
  };
};

export const isConfiguredRecordRow = (row: WorkspaceRecordRow): row is ConfiguredRecordRow =>
  row.classification.lifecycle === "configured" && typeof row.enabled === "boolean";
export const isInstalledRecordRow = (row: WorkspaceRecordRow): row is InstalledRecordRow =>
  row.classification.lifecycle === "configured" || row.classification.lifecycle === "implicit";
export const isUnmanagedRecordRow = (row: WorkspaceRecordRow): row is UnmanagedRecordRow =>
  row.classification.lifecycle === "leftover" ||
  row.classification.lifecycle === "undeclared" ||
  row.classification.lifecycle === "unmanaged";

export const configuredRecordRows = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  rows.filter(isConfiguredRecordRow);
export const installedRecordRows = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  rows.filter(isInstalledRecordRow);
export const unmanagedRecordRows = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  rows.filter(isUnmanagedRecordRow);

export const recordRowsByName = <R extends { readonly name: string }>(
  rows: ReadonlyArray<R>,
): Record.ReadonlyRecord<string, R> => {
  const result: globalThis.Record<string, R> = {};
  for (const row of rows) result[row.name] = row;
  return result;
};
export const configuredRowsByName = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  recordRowsByName(configuredRecordRows(rows));
export const installedRowsByName = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  recordRowsByName(installedRecordRows(rows));
export const unmanagedRowsByName = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  recordRowsByName(unmanagedRecordRows(rows));

const priority: Readonly<globalThis.Record<ExtensionInventoryLifecycle, number>> = {
  configured: 0,
  implicit: 1,
  leftover: 2,
  undeclared: 3,
  unmanaged: 4,
};
const sorted = (values: ReadonlySet<string>): ReadonlyArray<string> =>
  Array.from(values).sort((left, right) => left.localeCompare(right));

/** Combine observations of the same extension, keeping the strongest lifecycle claim. */
export const aggregateWorkspaceRecords = (
  candidates: ReadonlyArray<WorkspaceRecordRow>,
): ReadonlyArray<WorkspaceRecordRow> => {
  const byKey = new Map<
    string,
    {
      row: WorkspaceRecordRow;
      agents: Set<string>;
      origins: Set<string>;
      paths: Set<string>;
    }
  >();
  for (const candidate of candidates) {
    const key = `${candidate.scope}:${candidate.type}:${candidate.name}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, {
        row: candidate,
        agents: new Set(candidate.agents),
        origins: new Set(candidate.origins),
        paths: new Set(candidate.paths),
      });
      continue;
    }
    const installed = existing.row.installed || candidate.installed;
    if (
      priority[candidate.classification.lifecycle] < priority[existing.row.classification.lifecycle]
    ) {
      existing.row = candidate;
    }
    existing.row = { ...existing.row, installed };
    for (const agent of candidate.agents) existing.agents.add(agent);
    for (const origin of candidate.origins) existing.origins.add(origin);
    for (const path of candidate.paths) existing.paths.add(path);
  }
  return Array.from(byKey.values())
    .map(({ row, agents, origins, paths }) => ({
      ...row,
      agents: sorted(agents),
      origins: sorted(origins),
      paths: sorted(paths),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

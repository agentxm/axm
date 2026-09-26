/** Lifecycle records projected once from the typed workspace subject cells. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Record from "effect/Record";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/common";
import type { InstallRootInventory } from "../install-root.js";
import type { WorkspaceLayout } from "../layout.js";
import type { LockfileReadError, SettingsReadError } from "./errors.js";
import type { ActualHook } from "./extensions/hook.js";
import type { ActualKnowledgeBundle } from "./extensions/knowledge.js";
import type { ActualMcpServer } from "./extensions/mcp-server.js";
import type { ActualPack } from "./extensions/pack.js";
import type { PackMemberBinding } from "./extensions/projection.js";
import type { ActualRule } from "./extensions/rule.js";
import type { ActualSkill } from "./extensions/skill.js";
import type { ActualSubagent } from "./extensions/subagent.js";
import type { WorkspaceReadModel } from "./service.js";
import type { ActivationState, ExtensionKey } from "./types.js";

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

type ActualObservation =
  | ActualSkill
  | ActualMcpServer
  | ActualSubagent
  | ActualRule
  | ActualHook
  | ActualKnowledgeBundle
  | ActualPack;
interface InstalledFact {
  readonly key: ExtensionKey;
  readonly installationOrigin:
    | {
        readonly _tag: "direct";
        readonly declared: { readonly entry: { readonly source?: string | undefined } };
      }
    | { readonly _tag: "pack-member" };
  readonly activation: ActivationState;
  readonly actual: ReadonlyArray<ActualObservation>;
}
interface UnmanagedFact {
  readonly key: ExtensionKey;
  readonly actual: ActualObservation;
}
interface SubjectCells {
  readonly installed: Effect.Effect<
    ReadonlyArray<InstalledFact>,
    SettingsReadError | LockfileReadError
  >;
  readonly packMemberRows: (
    bindings: ReadonlyArray<PackMemberBinding>,
  ) => Effect.Effect<ReadonlyArray<InstalledFact>, SettingsReadError | LockfileReadError>;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedFact>,
    SettingsReadError | LockfileReadError
  >;
}

const subjectCells = (scoped: WorkspaceReadModel, type: InstallableExtensionType): SubjectCells => {
  switch (type) {
    case "skill":
      return scoped.skills;
    case "mcp-server":
      return scoped.mcpServers;
    case "subagent":
      return scoped.subagents;
    case "rule":
      return scoped.rules;
    case "hook":
      return scoped.hooks;
    case "knowledge":
      return scoped.knowledge;
    case "pack":
      return { ...scoped.packs, packMemberRows: () => Effect.succeed([]) };
  }
};

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

const observations = (
  actuals: ReadonlyArray<ActualObservation>,
  relative: (absolute: string) => string,
) => ({
  agents: actuals.flatMap((actual) => ("agentId" in actual.origin ? [actual.origin.agentId] : [])),
  origins: actuals.map((actual) => actual.origin._tag),
  paths: actuals.flatMap((actual) => {
    const path =
      actual.packageRoot ??
      actual.contentRoot ??
      ("configFile" in actual ? actual.configFile : undefined);
    return path === undefined || path === null ? [] : [relative(path)];
  }),
});

const unexplainedLifecycle = (
  layout: Option.Option<WorkspaceLayout>,
  key: ExtensionKey,
  actual: ActualObservation,
  installRoot: InstallRootInventory,
  isWithin: (root: string, target: string) => boolean,
): Option.Option<"leftover" | "undeclared" | "unmanaged"> => {
  if (Option.isNone(layout)) return Option.some("unmanaged");
  const packageLocation = actual.packageRoot ?? actual.contentRoot;
  if (packageLocation === undefined || packageLocation === null) return Option.some("unmanaged");
  switch (actual.origin._tag) {
    case "canonical-axm-skill":
    case "canonical-axm-mcp-server":
    case "canonical-axm-subagent":
    case "canonical-axm-rule":
    case "canonical-axm-hook":
    case "canonical-axm-knowledge":
    case "canonical-axm-pack": {
      const entry = installRoot.packages.find((candidate) => candidate.path === packageLocation);
      if (entry !== undefined) {
        if (!entry.reached) return Option.some("leftover");
        if (entry.sourceDirectory === undefined) return Option.some("undeclared");
        return Option.none();
      }
      if (
        layout.value.scope === "project" &&
        isWithin(layout.value.authoredRoot(key.type), packageLocation)
      ) {
        return Option.some("undeclared");
      }
      return Option.some("unmanaged");
    }
    default:
      return Option.some("unmanaged");
  }
};

/** Project one extension family's rows, with one record per scope/type/name. */
export const projectWorkspaceRecords = (
  scoped: WorkspaceReadModel,
  type: InstallableExtensionType,
  deps: {
    readonly bindings: ReadonlyArray<PackMemberBinding>;
    readonly installRoot: InstallRootInventory;
    readonly configuredAgents: ReadonlyArray<string>;
    readonly relative: (absolute: string) => string;
    readonly isWithin: (root: string, target: string) => boolean;
  },
): Effect.Effect<ReadonlyArray<WorkspaceRecordRow>, SettingsReadError | LockfileReadError> =>
  Effect.gen(function* () {
    const subject = subjectCells(scoped, type);
    const direct = yield* subject.installed;
    const members = yield* subject.packMemberRows(deps.bindings);
    const unmanaged = yield* subject.unmanaged;
    const memberNames = new Set(members.map((row) => row.key.name));
    const candidates: Array<WorkspaceRecordRow> = [];
    for (const row of [...direct, ...members]) {
      const observed = observations(row.actual, deps.relative);
      const directOrigin = row.installationOrigin._tag === "direct";
      const source = directOrigin ? row.installationOrigin.declared.entry.source : undefined;
      candidates.push({
        scope: row.key.scope,
        type,
        name: row.key.name,
        classification: { kind: "lifecycle", lifecycle: directOrigin ? "configured" : "implicit" },
        enabled: row.activation === "enabled",
        installed: row.actual.length > 0,
        agents:
          type === "mcp-server" || observed.agents.length === 0
            ? deps.configuredAgents
            : observed.agents,
        origins: observed.origins,
        paths: observed.paths,
        ...(source === undefined ? {} : { source }),
      });
    }
    for (const row of unmanaged) {
      if (memberNames.has(row.key.name)) continue;
      const lifecycle = unexplainedLifecycle(
        scoped.layout,
        row.key,
        row.actual,
        deps.installRoot,
        deps.isWithin,
      );
      if (Option.isNone(lifecycle)) continue;
      const observed = observations([row.actual], deps.relative);
      candidates.push({
        scope: row.key.scope,
        type,
        name: row.key.name,
        classification: { kind: "lifecycle", lifecycle: lifecycle.value },
        enabled: null,
        installed: true,
        ...observed,
      });
    }
    return aggregateWorkspaceRecords(candidates);
  });

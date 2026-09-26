/** Lifecycle records projected once from the typed workspace subject cells. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { InstallRootInventory } from "../workspace/install-root.js";
import type { WorkspaceLayout } from "../workspace/layout.js";
import type { LockfileReadError, SettingsReadError } from "./errors.js";
import type { ActualHook } from "./extensions/hook.js";
import type { ActualKnowledgeBundle } from "./extensions/knowledge.js";
import type { ActualMcpServer } from "./extensions/mcp-server.js";
import type { ActualPack } from "./extensions/pack.js";
import type { PackMemberBinding } from "./extensions/projection.js";
import type { ActualRule } from "./extensions/rule.js";
import type { ActualSkill } from "./extensions/skill.js";
import type { ActualSubagent } from "./extensions/subagent.js";
import { aggregateWorkspaceRecords, type WorkspaceRecordRow } from "./records.js";
import type { WorkspaceReadModel } from "./service.js";
import type { ActivationState, ExtensionKey } from "./types.js";

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

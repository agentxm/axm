/**
 * What one extension type's inventory means.
 *
 * Each per-type list joins the physical inventory with the workspace's
 * configured entries and accepted resolutions and decides the facts a row
 * reports: which source a row came from, whether it is locked, what version is
 * accepted, and which owner a pack's locator names. The application renders
 * those facts; it does not derive them.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import {
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  inspectMcpServerAcrossAgents,
  type McpInspectionError,
} from "@agentxm/workspace-projection";
import {
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type ConfiguredAgentOutcome,
  type ExtensionInventory,
  type ExtensionInventoryRow,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";

import {
  mcpServerListRows,
  type McpServerListRow,
  type McpServerMachineSource,
  type McpServerResolution,
} from "./mcp-servers.js";

/** Facts every per-type list row carries. */
export interface TypeListRow {
  readonly name: string;
  readonly lifecycle: ExtensionInventoryRow["classification"]["lifecycle"];
  readonly enabled: boolean | null;
  readonly agents: ReadonlyArray<string>;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

export interface SkillListRow extends TypeListRow {
  /** The accepted source kind, or `detected` when nothing is locked. */
  readonly sourceType: string;
}

export interface SourcedListRow extends TypeListRow {
  readonly source: string;
  readonly locked: boolean;
}

export interface PackListRow extends TypeListRow {
  readonly owner: string;
  readonly version: string;
  readonly source: string;
}

export interface TypeListResult<Row> {
  /** The inventory document, with each row carrying the derived facts. */
  readonly inventory: ExtensionInventory;
  readonly rows: ReadonlyArray<Row>;
}

type InventoryRowAugmentation = Partial<
  Pick<
    ExtensionInventoryRow,
    | "source"
    | "version"
    | "owner"
    | "transport"
    | "status"
    | "locked"
    | "sourceType"
    | "agentOutcomes"
  >
>;

const augment = (
  inventory: ExtensionInventory,
  augmentation: (row: ExtensionInventoryRow) => InventoryRowAugmentation,
): ExtensionInventory => ({
  ...inventory,
  items: inventory.items.map((row) => ({ ...row, ...augmentation(row) })),
});

const baseRow = (row: ExtensionInventoryRow): TypeListRow => ({
  name: row.name,
  lifecycle: row.classification.lifecycle,
  enabled: row.enabled,
  agents: row.agents,
  agentOutcomes: row.agentOutcomes,
});

const inventoryFor = (type: InstallableExtensionType, agents: ReadonlyArray<string>) =>
  Effect.flatMap(WorkspaceRecords, (records) =>
    records.getExtensionInventory(type, agents.length === 0 ? {} : { agents }),
  );

/** Skills: the accepted source kind is the row's type; unlocked skills are detected. */
export const listSkills = Effect.fn("Inspection.listSkills")(function* (request: {
  readonly agents?: ReadonlyArray<string>;
}) {
  const lockfile = yield* LockfileReader;
  const inventory = yield* inventoryFor("skill", request.agents ?? []);
  const locked = yield* lockfile.entries("skill");
  const rows = inventory.items.map((row): SkillListRow => ({
    ...baseRow(row),
    sourceType: locked[row.name]?.type ?? "detected",
  }));
  return {
    inventory: augment(inventory, (row) => ({ sourceType: locked[row.name]?.type ?? "detected" })),
    rows,
  } satisfies TypeListResult<SkillListRow>;
});

/** Subagents: an empty agent list means every configured agent receives it. */
export const listSubagents = Effect.fn("Inspection.listSubagents")(function* (request: {
  readonly agents?: ReadonlyArray<string>;
}) {
  const inventory = yield* inventoryFor("subagent", request.agents ?? []);
  return {
    inventory,
    rows: inventory.items.map(baseRow),
  } satisfies TypeListResult<TypeListRow>;
});

const sourcedRows = (
  type: "rule" | "hook",
  inventory: ExtensionInventory,
  configured: Readonly<Record<string, { readonly source: string } | undefined>>,
  locked: Readonly<Record<string, unknown>>,
  outcomesFor: (row: ExtensionInventoryRow) => ReadonlyArray<ConfiguredAgentOutcome>,
): TypeListResult<SourcedListRow> => {
  const rows = inventory.items.map((row): SourcedListRow => ({
    ...baseRow(row),
    agentOutcomes: outcomesFor(row),
    source: configured[row.name]?.source ?? row.origins.join(", "),
    locked: locked[row.name] !== undefined,
  }));
  const byName = new Map(rows.map((row) => [row.name, row]));
  return {
    inventory: augment(inventory, (row) => {
      const derived = byName.get(row.name);
      return {
        source: derived?.source ?? row.origins.join(", "),
        locked: derived?.locked ?? false,
        ...(type === "hook" ? { agentOutcomes: derived?.agentOutcomes ?? row.agentOutcomes } : {}),
      };
    }),
    rows,
  };
};

export const listRules = Effect.fn("Inspection.listRules")(function* () {
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const inventory = yield* inventoryFor("rule", []);
  const configured = yield* settings.entries("rule");
  const locked = yield* lockfile.entries("rule");
  return sourcedRows("rule", inventory, configured, locked, (row) => row.agentOutcomes);
});

/**
 * Hooks: when a hook is not disabled, the effective per-agent outcomes a
 * refining provider observes replace the generic read-model derivation.
 */
export const listHooks = Effect.fn("Inspection.listHooks")(function* () {
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const inventory = yield* inventoryFor("hook", []);
  const configured = yield* settings.entries("hook");
  const locked = yield* lockfile.entries("hook");
  const provider = yield* Effect.serviceOption(ConfiguredAgentOutcomesProvider);
  const refine = Option.flatMap(provider, (service) =>
    Option.fromUndefinedOr(service.byExtensionType["hook"]),
  );
  const effective = Option.isSome(refine) ? yield* refine.value("current") : [];
  return sourcedRows("hook", inventory, configured, locked, (row) =>
    row.enabled === false
      ? row.agentOutcomes
      : effective.filter((outcome) => outcome.name === row.name),
  );
});

/**
 * Packs: the owner comes from the accepted entry, then the source-qualified
 * registry locator, then the fully qualified name a workspace locator carries.
 */
export const listPacks = Effect.fn("Inspection.listPacks")(function* () {
  const lockfile = yield* LockfileReader;
  const inventory = yield* inventoryFor("pack", []);
  const packs = yield* lockfile.entries("pack");
  const rows = inventory.items.map((row): PackListRow => {
    const entry = packs[row.name];
    const configuredSource = row.source ?? row.origins.join(", ");
    const registrySource = parseSourceQualifiedRegistrySourcePatternParts(configuredSource);
    const workspaceSource = parseExtensionFqnParts(
      configuredSource.replace(/^workspace:/u, "").replace(/@[^@/]+$/u, ""),
    );
    return {
      ...baseRow(row),
      owner: entry?.owner ?? registrySource?.owner ?? workspaceSource?.owner ?? "n/a",
      version: entry?.resolvedVersion ?? "n/a",
      source: configuredSource.startsWith("workspace:")
        ? "workspace"
        : (entry?.sourceName ?? configuredSource),
    };
  });
  const byName = new Map(rows.map((row) => [row.name, row]));
  return {
    inventory: augment(inventory, (row) => {
      const derived = byName.get(row.name);
      return {
        owner: derived?.owner ?? "n/a",
        version: derived?.version ?? "n/a",
        source: derived?.source ?? row.origins.join(", "),
      };
    }),
    rows,
  } satisfies TypeListResult<PackListRow>;
});

/** MCP servers: the inventory join plus the projection's per-agent drift facts. */
// The MCP inventory is the one per-type list that reads native agent
// configuration, so its failures include the projection family. Naming that
// family here keeps the published signature referring to the package this one
// depends on rather than expanding into the vocabulary it aggregates.
export const listMcpServers: () => Effect.Effect<
  TypeListResult<McpServerListRow>,
  WorkspaceStateReadFailure | McpInspectionError,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceRecords
  | LockfileReader
  | SettingsReader
  | DesiredStateReader
  | WorkspaceLocation
> = Effect.fn("Inspection.listMcpServers")(function* () {
  const location = yield* WorkspaceLocation;
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const desiredState = yield* DesiredStateReader;
  const inventory = yield* inventoryFor("mcp-server", []);
  const configured = yield* settings.entries("mcp-server");
  const configuredAgents = yield* settings.configuredAgents;
  const graph = yield* desiredState.graph();
  const rows = yield* Effect.forEach(
    inventory.items,
    (row) =>
      Effect.gen(function* () {
        const locked = yield* lockfile.mcpServerForConnection(row.name);
        const configuredEntry = configured[row.name];
        const desiredNode = graph.nodes.find(
          (node) => node.type === "mcp-server" && node.name === row.name,
        );
        const inspections =
          row.enabled !== false &&
          (row.classification.lifecycle === "configured" ||
            row.classification.lifecycle === "implicit") &&
          configuredEntry !== undefined
            ? yield* inspectMcpServerAcrossAgents({
                workspaceRoot: location.baseDir,
                scope: location.scope,
                agentIds: configuredAgents,
                serverName: row.name,
                entry: configuredEntry,
                canonicalPaths: row.paths,
              })
            : [];
        return mcpServerListRows({
          row: baseRow(row),
          origins: row.origins,
          configuredEntry,
          desiredNode,
          locked,
          inspections,
        });
      }),
    { concurrency: "unbounded" },
  );
  const byName = new Map(rows.map((row) => [row.name, row]));
  return {
    inventory: augment(inventory, (row) => {
      const derived = byName.get(row.name);
      return {
        version: derived?.version ?? "n/a",
        transport: derived?.transport ?? "auto",
        status: derived?.status ?? "n/a",
        agentOutcomes: derived?.agentOutcomes ?? row.agentOutcomes,
      };
    }),
    rows,
  } satisfies TypeListResult<McpServerListRow>;
});

export type { McpServerListRow, McpServerMachineSource, McpServerResolution };

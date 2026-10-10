import { withInspectionReadView } from "../read-view.js";
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
import type * as Path from "effect/Path";

import {
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  inspectDesiredMcpServer,
  type McpInspectionError,
} from "@agentxm/workspace-kernel/projection";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type ExtensionInventory,
  type ExtensionInventoryRow,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-kernel/workspace-state";

import {
  mcpServerListRows,
  type McpServerListRow,
  type McpServerResolution,
} from "./mcp-servers.js";
import { buildInventoryDocument, type ExtensionInventoryDocument } from "../inventory-document.js";
import { mcpServerListDocument, type McpServerListQueryResult } from "./mcp-servers.js";
import type { TypeListRow } from "./type-list-row.js";

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

export interface TypeListResult<Row, Document = ExtensionInventoryDocument> {
  readonly document: Document;
  /** The inventory document, with each row carrying the derived facts. */
  readonly inventory: ExtensionInventory;
  readonly rows: ReadonlyArray<Row>;
}

const withListDocument = Effect.fn("Inspection.withListDocument")(function* <Row>(result: {
  readonly inventory: ExtensionInventory;
  readonly rows: ReadonlyArray<Row>;
}) {
  return { ...result, document: yield* buildInventoryDocument(result.inventory) };
});

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
  ...(row.nativeLocations === undefined
    ? {}
    : { nativeLocations: row.nativeLocations, duplicateDiscoveries: row.duplicateDiscoveries }),
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
    sourceType: locked[row.name]?.source.type ?? "detected",
  }));
  return yield* withListDocument({
    inventory: augment(inventory, (row) => ({
      sourceType: locked[row.name]?.source.type ?? "detected",
    })),
    rows,
  });
}, withInspectionReadView);

/** Subagents: an empty agent list means every configured agent receives it. */
export const listSubagents = Effect.fn("Inspection.listSubagents")(function* (request: {
  readonly agents?: ReadonlyArray<string>;
}) {
  const inventory = yield* inventoryFor("subagent", request.agents ?? []);
  return yield* withListDocument({ inventory, rows: inventory.items.map(baseRow) });
}, withInspectionReadView);

const sourcedRows = (
  inventory: ExtensionInventory,
  configured: Readonly<Record<string, { readonly source?: string | undefined } | undefined>>,
  locked: Readonly<Record<string, unknown>>,
) => {
  const rows = inventory.items.map((row): SourcedListRow => ({
    ...baseRow(row),
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
      };
    }),
    rows,
  };
};

export const listRules = Effect.fn("Inspection.listRules")(function* (request: {
  readonly agents?: ReadonlyArray<string>;
}) {
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const inventory = yield* inventoryFor("rule", request.agents ?? []);
  const configured = yield* settings.entries("rule");
  const locked = yield* lockfile.entries("rule");
  return yield* withListDocument(sourcedRows(inventory, configured, locked));
}, withInspectionReadView);

/** Hooks consume the resolved per-agent outcomes carried by inventory rows. */
export const listHooks = Effect.fn("Inspection.listHooks")(function* (request: {
  readonly agents?: ReadonlyArray<string>;
}) {
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const inventory = yield* inventoryFor("hook", request.agents ?? []);
  const configured = yield* settings.entries("hook");
  const locked = yield* lockfile.entries("hook");
  return yield* withListDocument(sourcedRows(inventory, configured, locked));
}, withInspectionReadView);

/**
 * Packs: the owner comes from the accepted entry, then the source-qualified
 * registry locator, then the fully qualified name a workspace locator carries.
 */
export const listPacks = Effect.fn("Inspection.listPacks")(function* (request: {
  readonly agents?: ReadonlyArray<string>;
}) {
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const inventory = yield* inventoryFor("pack", request.agents ?? []);
  const configured = yield* settings.entries("pack");
  const packs = yield* lockfile.entries("pack");
  const rows = inventory.items.map((row): PackListRow => {
    const entry = packs[row.name];
    const configuredSource = configured[row.name]?.source ?? row.source ?? row.origins.join(", ");
    const registrySource = parseSourceQualifiedRegistrySourcePatternParts(configuredSource);
    const workspaceSource = parseExtensionFqnParts(
      configuredSource.replace(/^workspace:/u, "").replace(/@[^@/]+$/u, ""),
    );
    return {
      ...baseRow(row),
      owner: entry?.identity.owner ?? registrySource?.owner ?? workspaceSource?.owner ?? "n/a",
      version: entry?.manifestVersion ?? "n/a",
      source: configuredSource.startsWith("workspace:") ? "workspace" : configuredSource,
    };
  });
  const byName = new Map(rows.map((row) => [row.name, row]));
  return yield* withListDocument({
    inventory: augment(inventory, (row) => {
      const derived = byName.get(row.name);
      return {
        owner: derived?.owner ?? "n/a",
        version: derived?.version ?? "n/a",
        source: derived?.source ?? row.origins.join(", "),
      };
    }),
    rows,
  });
}, withInspectionReadView);

/** MCP servers: the inventory join plus the projection's per-agent drift facts. */
// The MCP inventory is the one per-type list that reads native agent
// configuration, so its failures include the projection family. Naming that
// family here keeps the published signature referring to the package this one
// depends on rather than expanding into the vocabulary it aggregates.
export const listMcpServers: (request: {
  readonly agents?: ReadonlyArray<string>;
}) => Effect.Effect<
  TypeListResult<McpServerListRow, McpServerListQueryResult>,
  WorkspaceStateReadFailure | McpInspectionError,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceRecords
  | LockfileReader
  | SettingsReader
  | DesiredStateReader
  | WorkspaceLocation
> = Effect.fn("Inspection.listMcpServers")(function* (request: {
  readonly agents?: ReadonlyArray<string>;
}) {
  const location = yield* WorkspaceLocation;
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const desiredState = yield* DesiredStateReader;
  const inventory = yield* inventoryFor("mcp-server", request.agents ?? []);
  const configured = yield* settings.entries("mcp-server");
  const configuredAgents = yield* settings.configuredAgents;
  const graph = yield* desiredState.graph();
  const rows = yield* Effect.forEach(
    inventory.items,
    (row) =>
      Effect.gen(function* () {
        const locked = yield* lockfile.acceptedEntry("mcp-server", row.name);
        const configuredEntry = configured[row.name];
        const desiredNode = graph.nodes.find(
          (node) => node.type === "mcp-server" && node.name === row.name,
        );
        // Every desired connection is inspected the same way, whether the
        // workspace declared it or a Pack supplied it.
        const inspection =
          row.enabled !== false && desiredNode !== undefined && desiredNode.enabled
            ? yield* inspectDesiredMcpServer({
                nativeDirectoryInputs: location.nativeDirectoryInputs,
                workspaceRoot: location.baseDir,
                scope: location.scope,
                agentIds: configuredAgents,
                node: desiredNode,
                entry: configuredEntry,
                canonicalPaths: row.paths,
              })
            : undefined;
        return mcpServerListRows({
          row: baseRow(row),
          origins: row.origins,
          configuredEntry,
          desiredNode,
          locked,
          inspection,
        });
      }),
    { concurrency: 16 },
  );
  const byName = new Map(rows.map((row) => [row.name, row]));
  const augmented = augment(inventory, (row) => {
    const derived = byName.get(row.name);
    return {
      version: derived?.version ?? "n/a",
      transport: derived?.transport ?? "auto",
      status: derived?.status ?? "n/a",
      agentOutcomes: derived?.agentOutcomes ?? row.agentOutcomes,
    };
  });
  const document = yield* buildInventoryDocument(augmented);
  return { inventory: augmented, rows, document: mcpServerListDocument({ document, rows }) };
}, withInspectionReadView);

export type { McpServerListRow, McpServerResolution };

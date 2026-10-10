import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import {
  ABSENT,
  agentOutcome,
  count,
  type Text,
  type Tint,
  type ViewColumn,
} from "../screen/index.js";
import type {
  ExtensionInventoryDocument,
  SourcedListRow,
} from "@agentxm/workspace-features/inspection";
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-kernel/operations";
import type { ExtensionInventoryLifecycle } from "@agentxm/workspace-kernel/workspace-state";

/**
 * Each extension type's tint, so a reader tells types apart down an inventory
 * column. Terminals offer few standard colours, so a container shares one with
 * the type it most often holds.
 */
const extensionTypeTints: Readonly<Record<InstallableExtensionType, Tint>> = {
  skill: "green",
  subagent: "magenta",
  pack: "magenta",
  "mcp-server": "blue",
  knowledge: "blue",
  rule: "yellow",
  hook: "cyan",
};

const isInstallableExtensionType = (type: string): type is InstallableExtensionType =>
  Object.hasOwn(extensionTypeTints, type);

/** An extension type in its tint; a type this CLI does not know stays plain. */
export const extensionTypeText = (type: string): Text =>
  isInstallableExtensionType(type) ? [{ text: type, tint: extensionTypeTints[type] }] : type;

/** Facts every inventory row carries, whatever its extension type. */
interface InventoryRowFacts {
  readonly lifecycle: ExtensionInventoryLifecycle;
  readonly enabled: boolean | null;
}

export const inventoryLifecycle = (row: Pick<InventoryRowFacts, "lifecycle">): string => {
  switch (row.lifecycle) {
    case "configured":
      return "managed by this workspace";
    case "implicit":
      return "included by a pack";
    case "leftover":
      return "installed but no longer selected";
    case "undeclared":
      return "authored here but not added";
    case "unmanaged":
      return "outside AXM";
  }
};

export const inventoryActivation = (row: InventoryRowFacts): string =>
  row.enabled === null ? ABSENT : row.enabled ? "enabled" : "disabled";

export const inventoryAgentOutcomes = (outcomes: ReadonlyArray<ConfiguredAgentOutcome>): string =>
  outcomes.length === 0
    ? "none"
    : outcomes.map(({ agentId, outcome }) => `${agentId}: ${agentOutcome(outcome)}`).join(", ");

/** Shared sourced-row presentation for Hooks and Rules. */
export const sourcedListColumns = [
  { header: "Name", priority: "required", value: (row: SourcedListRow) => row.name },
  { header: "Management", value: (row: SourcedListRow) => inventoryLifecycle(row) },
  { header: "Activation", value: (row: SourcedListRow) => inventoryActivation(row) },
  { header: "Source", value: (row: SourcedListRow) => row.source },
  {
    header: "Locked",
    priority: "optional",
    value: (row: SourcedListRow) => (row.locked ? "yes" : "no"),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: SourcedListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<SourcedListRow>>;

type InventoryCounts = Pick<
  ExtensionInventoryDocument,
  "count" | "managementCounts" | "nativeLocationCounts"
> & {
  readonly items: ReadonlyArray<{ readonly installed: boolean }>;
};

export const inventorySummary = (inventory: InventoryCounts, label: string): string => {
  const native = inventory.nativeLocationCounts;
  const parts = [
    ...(native === undefined
      ? []
      : [
          `${native.units} native units`,
          `${native.physicalLocations} physical locations`,
          `${native.configuredConsumers} configured consumers`,
          ...(native.unverifiedExtensions === 0
            ? []
            : [`${native.unverifiedExtensions} extensions have unverified native locations`]),
        ]),
    inventory.managementCounts.configured === 0
      ? undefined
      : `${String(inventory.managementCounts.configured)} managed by this workspace`,
    inventory.managementCounts.implicit === 0
      ? undefined
      : `${String(inventory.managementCounts.implicit)} included by packs`,
    inventory.items.filter((item) => item.installed).length === 0
      ? undefined
      : `${String(inventory.items.filter((item) => item.installed).length)} installed`,
    inventory.managementCounts.leftover === 0
      ? undefined
      : `${String(inventory.managementCounts.leftover)} installed but no longer selected`,
    inventory.managementCounts.undeclared === 0
      ? undefined
      : `${String(inventory.managementCounts.undeclared)} authored here but not added`,
    inventory.managementCounts.unmanaged === 0
      ? undefined
      : `${String(inventory.managementCounts.unmanaged)} found outside AXM`,
  ].filter((part): part is string => part !== undefined);
  const headline = count(inventory.count, label);
  return parts.length === 0 ? headline : `${headline}: ${parts.join(", ")}`;
};

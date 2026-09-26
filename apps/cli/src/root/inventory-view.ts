import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import {
  ABSENT,
  agentOutcome,
  count,
  type Text,
  type Tint,
  type ViewColumn,
} from "../screen/index.js";
import type { SourcedListRow } from "@agentxm/workspace/inspection";
import type {
  ConfiguredAgentOutcome,
  ExtensionInventory,
  ExtensionInventoryLifecycle,
} from "@agentxm/workspace/desired-state";

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

export const inventoryLifecycle = (row: InventoryRowFacts): string => {
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
  { header: "State", value: (row: SourcedListRow) => inventoryLifecycle(row) },
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
  ExtensionInventory,
  | "count"
  | "configuredCount"
  | "implicitCount"
  | "installedCount"
  | "leftoverCount"
  | "undeclaredCount"
  | "unmanagedCount"
> & { readonly items: ReadonlyArray<unknown> };

export const inventorySummary = (inventory: InventoryCounts, label: string): string => {
  const parts = [
    inventory.configuredCount === 0
      ? undefined
      : `${String(inventory.configuredCount)} managed by this workspace`,
    inventory.implicitCount === 0
      ? undefined
      : `${String(inventory.implicitCount)} included by packs`,
    inventory.installedCount === 0 ? undefined : `${String(inventory.installedCount)} installed`,
    inventory.leftoverCount === 0
      ? undefined
      : `${String(inventory.leftoverCount)} installed but no longer selected`,
    inventory.undeclaredCount === 0
      ? undefined
      : `${String(inventory.undeclaredCount)} authored here but not added`,
    inventory.unmanagedCount === 0
      ? undefined
      : `${String(inventory.unmanagedCount)} found outside AXM`,
  ].filter((part): part is string => part !== undefined);
  const headline = count(inventory.count, label);
  return parts.length === 0 ? headline : `${headline}: ${parts.join(", ")}`;
};

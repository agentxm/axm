import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import type { Text, Tint } from "../screen/index.js";
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

export const inventoryLifecycle = (row: InventoryRowFacts): string => row.lifecycle;

export const inventoryActivation = (row: InventoryRowFacts): string =>
  row.enabled === null ? "n/a" : row.enabled ? "enabled" : "disabled";

export const inventoryAgentOutcomes = (outcomes: ReadonlyArray<ConfiguredAgentOutcome>): string =>
  outcomes.length === 0
    ? "none"
    : outcomes.map(({ agentId, outcome }) => `${agentId}:${outcome}`).join(", ");

export const inventorySummary = (inventory: ExtensionInventory, label: string): string =>
  `${inventory.count} ${inventory.count === 1 ? label : `${label}s`} (${inventory.configuredCount} configured, ${inventory.implicitCount} implicit, ${inventory.installedCount} installed, ${inventory.leftoverCount} leftover, ${inventory.undeclaredCount} undeclared, ${inventory.unmanagedCount} unmanaged)`;

import type { ConfiguredAgentOutcome, ExtensionInventory } from "@agentxm/workspace-state";

/** Facts every inventory row carries, whatever its extension type. */
interface InventoryRowFacts {
  readonly lifecycle: "configured" | "implicit" | "unmanaged";
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
  `${inventory.count} ${inventory.count === 1 ? label : `${label}s`} (${inventory.configuredCount} configured, ${inventory.implicitCount} implicit, ${inventory.installedCount} installed, ${inventory.unmanagedCount} unmanaged)`;

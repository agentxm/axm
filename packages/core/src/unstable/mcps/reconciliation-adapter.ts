import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const mcpServerReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "mcps",
  label: "MCP server",
  selectEntries: (settings) => settings.mcpServers,
});

import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const subagentReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "subagents",
  label: "subagent",
  selectEntries: (settings) => settings.subagents,
});

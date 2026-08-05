import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const knowledgeReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "knowledge",
  label: "knowledge bundle",
  selectEntries: (settings) => settings.knowledge,
});

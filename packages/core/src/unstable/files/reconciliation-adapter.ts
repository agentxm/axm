import { makeRegistryReconciliationAdapter } from "../workspace/registry-reconciliation-adapter.js";

export const filesReconciliationAdapter = makeRegistryReconciliationAdapter({
  type: "files",
  label: "Context Files package",
  selectEntries: (settings) => settings.files,
});

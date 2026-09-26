/**
 * Packs extension kind: what the lifecycle and sync features and the
 * application consume.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
} from "./errors.js";
export { prepareConfiguredPackIntent } from "./install/configured-intent.js";
export {
  packMemberConflicts,
  readProposedGraph,
  selectPackGraph,
} from "./install/graph-selection.js";
export {
  configuredEntryConstraintBlockPlan,
  configuredPackConstraintBlockPlan,
  PACK_CONSTRAINT_CONFLICT_BLOCKER_ID,
  packUpdateGroups,
  relevantPackConstraintProblems,
} from "./lifecycle/constraint-gate.js";
export { validatePackGraphPostcondition } from "./lifecycle/graph-transition.js";
export {
  discoverPackRefs,
  finalizePackInstallIntent,
  packDiscoveryDiagnostics,
  parsePackInstallRequest,
  planPackInstall,
  resolvePackSourceRequest,
  type PackInstallIntent,
  type PackInstallRequirements,
} from "./lifecycle/install/plan.js";
export {
  finalizePackUninstallIntent,
  parsePackUninstallSelectors,
  planPackUninstall,
  type PackUninstallRequirements,
} from "./lifecycle/uninstall/plan.js";
export {
  PACK_UNINSTALL_GRAPH_BLOCKER_ID,
  packUninstallRecoveryIdentifiers,
} from "./lifecycle/uninstall/readiness.js";

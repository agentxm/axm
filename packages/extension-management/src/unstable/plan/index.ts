/**
 * Interactive plan preview/apply orchestration.
 *
 * The plan pipeline primitives (`Plan`, `applyPlan`, operation resolutions,
 * and the plan-family errors) live in `@agentxm/workspace-operations`; this
 * module keeps only the workspace-interactive preview/apply backbone until
 * its `ConfiguredAgentOutcomesProvider` seam is inverted and it re-homes.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Workspace-interactive preview/apply backbone used by install/uninstall/pack.
export { previewOrApplyPlan } from "./resolve-plan.js";

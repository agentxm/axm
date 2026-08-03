/**
 * Plan pipeline — the stable kernel export path for the plan primitives
 * consumed by workspace commands, `axm lint --fix`, and any other shared-kernel
 * consumer that composes workspace `Operation`s.
 *
 * The registry Worker SHALL NOT import this module — publish never applies
 * fixes, so the plan pipeline tree-shakes out of the Worker bundle. See
 * the shared-kernel contract for plan pipeline primitives.
 *
 * Per-extension operation handlers (`install-skill`, `uninstall-skill`,
 * `enable-skill`, `disable-skill`, `install-pack`, `uninstall-pack`,
 * `install-command`, `uninstall-command`, `enable-command`, `disable-command`,
 * `install-mcp-server`, `uninstall-mcp-server`, `enable-subagent`,
 * `disable-subagent`) live in their domain modules and resolve their
 * `OperationHandler` type from this path.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export { ArtifactChangeSchema, OperationPreconditionSchema } from "./plan.js";
export type {
  ArtifactChange,
  CancelledPlan,
  CompletedJobStep,
  ErrorJobStep,
  ExecutedJob,
  ExecutedPlan,
  Job,
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Operation,
  OperationPrecondition,
  Plan,
  PlanResolution,
  PlanSection,
  PlannedJobStep,
  PreviewedPlan,
  ReadyJobStep,
  WarnJobStep,
} from "./plan.js";

// Apply plan + operation handler registry
export { applyPlan, type OperationHandler } from "./apply-plan.js";

// Resolve plan — both the workspace-interactive preview/apply backbone
// (`previewOrApplyPlan`, used by install/uninstall/pack) and the narrow
// lint-fix resolver (`resolvePlan`, used by `axm lint --fix` to wrap
// `PlannedJobStep[]` into a single-job `Plan` without reconciliation).
export { previewOrApplyPlan, resolvePlan, type ResolvePlanArgs } from "./resolve-plan.js";

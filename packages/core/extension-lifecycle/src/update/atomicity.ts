/**
 * The atomicity a workspace-wide update declares, and why.
 *
 * A targeted update is one closure and keeps the ordinary closure-atomic
 * promise. A workspace-wide sweep is not: it advances every configured entry
 * that can advance, each as its own closure, and deliberately leaves the ones
 * that already advanced committed when a later entry fails. There is no
 * cross-closure undo, so the operation reports itself `non-rollbackable`
 * rather than claiming a rollback it will not perform.
 *
 * The declaration lives with the update use case so the atomicity a person
 * reads in the result document is the one its owner decided, not one a
 * transport adapter chose while assembling a plan literal.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { AtomicityClass, PlanExecutionCapabilities } from "@agentxm/workspace-operations";

/** A workspace-wide update settles each entry independently and undoes none. */
export const WORKSPACE_UPDATE_ATOMICITY: AtomicityClass = "non-rollbackable";

/** The execution capabilities a workspace-wide update plan declares. */
export const WORKSPACE_UPDATE_EXECUTION_CAPABILITIES: PlanExecutionCapabilities = {
  rollback: WORKSPACE_UPDATE_ATOMICITY,
};

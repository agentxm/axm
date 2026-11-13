import { copyWorkspaceDocument } from "../desired/copy-document.js";
/** Owned input evidence for one desired-state evaluation. */
import { freezeWorkspaceValue } from "../desired/freeze-value.js";
import type { DesiredEvaluationInputs } from "./desired-evaluation-inputs.js";
import { evaluateDesiredState } from "./desired-state-evaluation.js";
import type { DesiredStateEvaluation } from "./read-contracts.js";

export const ownDesiredStateEvaluation = (
  captured: DesiredEvaluationInputs,
): DesiredStateEvaluation => {
  // These are validated document values, not services or evaluation graphs.
  // Domain copying preserves decoded URLs and extended tool data, including BigInt and Date.
  const inputs = copyWorkspaceDocument(captured);
  // Preserve the prototypes of the graph's Effect Result and Option values.
  const graph = freezeWorkspaceValue(evaluateDesiredState(inputs));
  return Object.freeze({
    // Never expose the owned backing values. Freezing a Date alone would still
    // permit setTime(), and readonly types do not protect nested tool data.
    get inputs() {
      return copyWorkspaceDocument(inputs);
    },
    graph,
  });
};

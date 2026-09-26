/**
 * The workspace kernel's reconciliation Layers.
 *
 * @experimental This API is unstable and may change without notice.
 */
import * as Layer from "effect/Layer";

import { kernelFailureToStepFailure } from "./failure-rendering.js";
import { StepFailureConversion } from "./step-failure-conversion.js";

/**
 * The kernel's own step-failure conversion: the kernel failure rendering,
 * where the kernel's families are every failure a caller can carry. An
 * application that renders feature families too provides its composed
 * catalog instead.
 */
export const KernelFailureConversionLive = Layer.succeed(StepFailureConversion, {
  toStepFailure: kernelFailureToStepFailure,
});

export { ConfiguredAgentOutcomesProviderLive } from "./configured-agent-outcomes-provider-live.js";
export { ProjectionParticipantsLive } from "./projection-participants-live.js";

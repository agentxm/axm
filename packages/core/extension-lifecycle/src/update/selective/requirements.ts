/**
 * What a selective update's plan steps declare at execution time.
 *
 * A selective advance runs the same install operation the install routes run,
 * so its steps carry the install step requirements plus the two services that
 * operation reaches for directly: the source providers it re-fetches through,
 * and the boundary's failure conversion. Those requirements travel with the
 * step and are composed once at the application's runtime boundary — nothing
 * is captured into a step's closure on the way.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { SourceHostProviders } from "@agentxm/extension-sources";

import type { InstallStepRequirements } from "../../install/vocabulary.js";
import type { StepFailureConversion } from "../../step-failure-conversion.js";

export type SelectiveUpdateStepRequirements =
  InstallStepRequirements | SourceHostProviders | StepFailureConversion;

/**
 * The one rendering of a desired node's canonical observation.
 *
 * Lint findings and sync blockers state the same fact about a desired node,
 * so both render it here rather than each describing the observation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  desiredPackageKey,
  type CanonicalObservation,
  type DesiredExtensionNode,
} from "../desired-state/index.js";
import {
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
} from "./constraint-invariant-fact.js";

/** Stable text for one desired node's canonical observation, shared by lint and sync. */
export const canonicalObservationFactText = (
  desired: DesiredExtensionNode,
  observation: CanonicalObservation,
): string => {
  const subject = `${desired.type} '${desiredPackageKey(desired.identity)}'`;
  switch (observation.status) {
    case "constraint-mismatch":
      return extensionConstraintFactText(
        makeExtensionConstraintInvariantFact(desired, observation),
      );
    case "missing-resolution":
      return `${subject} has no accepted resolution`;
    case "materialization-mismatch":
      return `${subject} differs from its accepted materialized package-tree integrity`;
    default:
      return `${subject} has canonical state ${observation.status}`;
  }
};

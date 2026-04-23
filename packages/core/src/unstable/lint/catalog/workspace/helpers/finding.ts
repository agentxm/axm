/**
 * Shared finding helpers for workspace lint rules.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { FindingBase } from "../../../rule.js";

/** Structural identity used by rule `fix` lookups. */
export const isSameFinding = (left: FindingBase, right: FindingBase): boolean =>
  left.ruleId === right.ruleId &&
  left.message === right.message &&
  left.location?.file === right.location?.file;

import type * as Array from "effect/Array";
import { expandGlobs } from "@agentxm/extension-model/unstable/extensions/name-patterns";

export interface SkillSelectionRequest {
  readonly requestedSkills: ReadonlyArray<string>;
  readonly all: boolean;
  readonly nonInteractive: boolean;
}

export type SkillSelectionDecision =
  | { readonly kind: "selected"; readonly names: ReadonlyArray<string> }
  | { readonly kind: "choice-required" }
  | { readonly kind: "unmatched" };

/**
 * Select this request's skills, preserving source order.
 * Named patterns take precedence over all/unattended selection. The existing
 * union-of-matches behavior is retained; unresolved selector requirements remain
 * explicit in the installation specification.
 */
export const decideSkillSelection = (
  names: Array.NonEmptyReadonlyArray<string>,
  request: SkillSelectionRequest,
): SkillSelectionDecision => {
  if (request.requestedSkills.length > 0) {
    const matched = expandGlobs(request.requestedSkills, names);
    return matched.length === 0 ? { kind: "unmatched" } : { kind: "selected", names: matched };
  }
  if (request.all || request.nonInteractive || names.length === 1) {
    return { kind: "selected", names };
  }
  return { kind: "choice-required" };
};

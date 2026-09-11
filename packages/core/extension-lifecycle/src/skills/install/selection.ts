/**
 * Which of a source's skills this request installs.
 *
 * Named skills are matched by glob and every named pattern must match
 * something; `--all` and an unattended invocation take everything; a source
 * offering exactly one skill needs no decision; anything else is a choice
 * only a person can make.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";

import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { expandGlobs } from "../../glob.js";
import {
  ExtensionSelectionInteraction,
  type ExtensionSelectionCancelled,
} from "../../install/selection-interaction.js";
import { installRefused } from "../../install/vocabulary.js";

export interface SkillSelectionRequest {
  /** Names or glob patterns the request named explicitly. */
  readonly requestedSkills: ReadonlyArray<string>;
  /** Take everything the source offers without asking. */
  readonly all: boolean;
  /** No prompt can open in this invocation. */
  readonly nonInteractive: boolean;
}

/** Settle which discovered skills this request installs. */
export const determineSkillsToInstall: (
  skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  request: SkillSelectionRequest,
) => Effect.Effect<
  ReadonlyArray<SkillExtensionRef>,
  ExtensionLifecycleFailed | ExtensionSelectionCancelled,
  ExtensionSelectionInteraction
> = Effect.fn("InstallExtensions.determineSkillsToInstall")(function* (
  skills: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  request: SkillSelectionRequest,
) {
  if (request.requestedSkills.length > 0) {
    const allNames = Array.map(skills, (skill) => skill.skill.name);
    const matched = expandGlobs(request.requestedSkills, allNames);
    if (matched.length === 0) {
      return yield* installRefused({
        category: "not_found",
        detail: `No skills matched: ${request.requestedSkills.join(", ")}. Source contains: ${[
          ...allNames,
        ]
          .sort((left, right) => left.localeCompare(right))
          .join(", ")}`,
        recover: "Check the skill names or patterns and try again",
      });
    }
    return Array.filter(skills, (skill) => matched.includes(skill.skill.name));
  }

  if (request.all || request.nonInteractive) return skills;
  if (skills.length === 1) return skills;

  const interaction = yield* ExtensionSelectionInteraction;
  return yield* interaction.selectSkills(skills);
});

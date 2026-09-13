/**
 * Skills selection application contract and workflow.
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { decideSkillSelection, type SkillSelectionRequest } from "../domain/selection.js";

export class SkillSelectionNotFound extends Data.TaggedError("SkillSelectionNotFound")<{
  readonly requested: ReadonlyArray<string>;
  readonly available: ReadonlyArray<string>;
}> {}

export class SkillSelectionCancelled extends Data.TaggedError("SkillSelectionCancelled")<{
  readonly message: string;
}> {}

/** The interface could not obtain a choice; this is distinct from cancellation. */
export class SkillSelectionUnavailable extends Data.TaggedError("SkillSelectionUnavailable")<{
  readonly cause?: unknown;
}> {}

export class SkillSelectionInteraction extends Context.Service<
  SkillSelectionInteraction,
  {
    readonly select: (
      candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
    ) => Effect.Effect<
      ReadonlyArray<SkillExtensionRef>,
      SkillSelectionCancelled | SkillSelectionUnavailable
    >;
  }
>()("@agentxm/extension-lifecycle/skills/SkillSelectionInteraction") {}

export type SkillSelectionFailure =
  SkillSelectionNotFound | SkillSelectionCancelled | SkillSelectionUnavailable;

/** Resolve the skill-owned decision through this capability's interaction port. */
export const determineSkillsToInstall = Effect.fn("Skills.determineSelection")(function* (
  candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef>,
  request: SkillSelectionRequest,
): Effect.fn.Return<
  ReadonlyArray<SkillExtensionRef>,
  SkillSelectionFailure,
  SkillSelectionInteraction
> {
  const names = Array.map(candidates, (ref) => ref.skill.name);
  const decision = decideSkillSelection(names, request);
  switch (decision.kind) {
    case "selected":
      return candidates.filter((ref) => decision.names.includes(ref.skill.name));
    case "unmatched":
      return yield* new SkillSelectionNotFound({
        requested: request.requestedSkills,
        available: names,
      });
    case "choice-required": {
      const interaction = yield* SkillSelectionInteraction;
      return yield* interaction.select(candidates);
    }
  }
});

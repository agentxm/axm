/**
 * Subagents selection application contract and workflow.
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { decideSubagentSelection, type SubagentSelectionRequest } from "../domain/selection.js";

export class SubagentSelectionNotFound extends Data.TaggedError("SubagentSelectionNotFound")<{
  readonly requested: ReadonlyArray<string>;
  readonly available: ReadonlyArray<string>;
}> {}

export class SubagentSelectionCancelled extends Data.TaggedError("SubagentSelectionCancelled")<{
  readonly message: string;
}> {}

/** The interface could not obtain a choice; this is distinct from cancellation. */
export class SubagentSelectionUnavailable extends Data.TaggedError("SubagentSelectionUnavailable")<{
  readonly cause?: unknown;
}> {}

export class SubagentSelectionInteraction extends Context.Service<
  SubagentSelectionInteraction,
  {
    readonly select: (
      candidates: Array.NonEmptyReadonlyArray<SubagentExtensionRef>,
    ) => Effect.Effect<
      ReadonlyArray<SubagentExtensionRef>,
      SubagentSelectionCancelled | SubagentSelectionUnavailable
    >;
  }
>()("@agentxm/workspace/subagents/lifecycle/SubagentSelectionInteraction") {}

export type SubagentSelectionFailure =
  SubagentSelectionNotFound | SubagentSelectionCancelled | SubagentSelectionUnavailable;

/** Resolve the subagent-owned decision through this capability's interaction port. */
export const determineSubagentsToInstall = Effect.fn("Subagents.determineSelection")(function* (
  candidates: Array.NonEmptyReadonlyArray<SubagentExtensionRef>,
  request: SubagentSelectionRequest,
): Effect.fn.Return<
  ReadonlyArray<SubagentExtensionRef>,
  SubagentSelectionFailure,
  SubagentSelectionInteraction
> {
  const names = Array.map(candidates, (ref) => ref.subagent.name);
  const decision = decideSubagentSelection(names, request);
  switch (decision.kind) {
    case "selected":
      return candidates.filter((ref) => decision.names.includes(ref.subagent.name));
    case "unmatched":
      return yield* new SubagentSelectionNotFound({
        requested: request.requestedSubagents,
        available: names,
      });
    case "explicit-selection-required":
      return yield* new SubagentSelectionUnavailable({});
    case "choice-required": {
      const interaction = yield* SubagentSelectionInteraction;
      return yield* interaction.select(candidates);
    }
  }
});

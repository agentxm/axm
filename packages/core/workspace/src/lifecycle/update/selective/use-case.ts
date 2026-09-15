/**
 * The selective update use case.
 *
 * `skills update` and `subagents update` narrow the configured entries with
 * the selectors a person typed, then advance the ones whose source now
 * resolves to something other than what was accepted. Both settle through the
 * same shape every other lifecycle use case does: `prepare` decides
 * everything and writes nothing, `previewOrApply` resolves the frozen
 * candidate into one operation outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import { prepareSelectiveSkillUpdate, type SelectiveSkillUpdateRequest } from "./skills.js";
import {
  prepareSelectiveSubagentUpdate,
  type SelectiveSubagentUpdateRequest,
} from "./subagents.js";
import { previewOrApplySelectiveUpdate } from "./vocabulary.js";

/** Everything a selective update route can ask for. */
export type SelectiveUpdateRequest = SelectiveSkillUpdateRequest | SelectiveSubagentUpdateRequest;

/** Settle a selective update: decide what may advance, write nothing. */
export const prepareSelectiveUpdate = Effect.fn("SelectiveUpdate.prepare")(function* (
  request: SelectiveUpdateRequest,
) {
  return request.kind === "selective-skills"
    ? yield* prepareSelectiveSkillUpdate(request)
    : yield* prepareSelectiveSubagentUpdate(request);
});

/** Settle a selective update, then preview or apply it. */
export const SelectiveUpdate = {
  prepare: prepareSelectiveUpdate,
  previewOrApply: previewOrApplySelectiveUpdate,
} as const;

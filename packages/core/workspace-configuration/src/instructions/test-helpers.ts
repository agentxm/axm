/**
 * Driving the instruction-management use case from this package's own tests
 * and specifications: settle a request, then apply or preview the candidate
 * it produced. A request the workspace already satisfies settles as
 * `Unchanged` and is returned as it is.
 */

import * as Effect from "effect/Effect";

import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";

import {
  ManageInstructions,
  type InstructionsUnchanged,
  type ManageInstructionsCandidate,
  type ManageInstructionsRequest,
} from "./manage-instructions.js";

const run = (request: ManageInstructionsRequest, mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* ManageInstructions.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* ManageInstructions.previewOrApply(
      candidate,
      mode === "apply" ? preapprovedPlanExecution : previewPlanExecution,
    );
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

export const applyInstructionsRequest = (request: ManageInstructionsRequest) =>
  run(request, "apply");

export const previewInstructionsRequest = (request: ManageInstructionsRequest) =>
  run(request, "preview");

export type InstructionsRunOutcome =
  | InstructionsUnchanged
  | {
      readonly candidate: ManageInstructionsCandidate;
      readonly resolution: Effect.Success<ReturnType<typeof ManageInstructions.previewOrApply>>;
      readonly outcome: ReturnType<typeof deriveOperationOutcome>;
    };

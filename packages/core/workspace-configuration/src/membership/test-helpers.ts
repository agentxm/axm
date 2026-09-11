/**
 * Driving the configured-agent membership use case from this package's own
 * tests and specifications: settle a request, then apply or preview the
 * candidate it produced.
 */

import * as Effect from "effect/Effect";

import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";

import {
  ConfigureAgents,
  type AddConfiguredAgentsRequest,
  type RemoveConfiguredAgentsRequest,
} from "./configure-agents.js";

const execution = (mode: "apply" | "preview") =>
  mode === "apply" ? preapprovedPlanExecution : previewPlanExecution;

export const runAgentsAdd = (request: AddConfiguredAgentsRequest, mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* ConfigureAgents.add.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* ConfigureAgents.add.previewOrApply(candidate, execution(mode));
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

export const runAgentsRemove = (
  request: RemoveConfiguredAgentsRequest,
  mode: "apply" | "preview",
) =>
  Effect.gen(function* () {
    const candidate = yield* ConfigureAgents.remove.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* ConfigureAgents.remove.previewOrApply(candidate, execution(mode));
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

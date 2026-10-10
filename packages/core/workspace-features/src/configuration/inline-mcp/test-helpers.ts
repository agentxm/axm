/**
 * Driving the inline MCP use cases from this package's own tests and
 * specifications: settle a request, then apply or preview the candidate.
 */

import * as Effect from "effect/Effect";

import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";

import { AddInlineMcpServer, type AddInlineMcpServerRequest } from "./add-inline-mcp-server.js";
import { AdoptMcpServers } from "../mcp-adoption/adopt-mcp-servers.js";

const execution = (mode: "apply" | "preview") =>
  mode === "apply" ? preapprovedPlanExecution : previewPlanExecution;

export const runInlineMcpAdd = (request: AddInlineMcpServerRequest, mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* AddInlineMcpServer.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* AddInlineMcpServer.previewOrApply(candidate, execution(mode));
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

export const runMcpAdoption = (mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* AdoptMcpServers.prepare();
    const resolution = yield* AdoptMcpServers.previewOrApply(candidate, execution(mode));
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

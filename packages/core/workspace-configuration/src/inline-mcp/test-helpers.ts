/**
 * Driving the inline MCP use cases from this package's own tests and
 * specifications: settle a request, then apply or preview the candidate.
 */

import * as Effect from "effect/Effect";

import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";

import { AddInlineMcpServer, type AddInlineMcpServerRequest } from "./add-inline-mcp-server.js";
import { ImportMcpServers } from "../mcp-import/import-mcp-servers.js";

const execution = (mode: "apply" | "preview") =>
  mode === "apply" ? preapprovedPlanExecution : previewPlanExecution;

export const runInlineMcpAdd = (request: AddInlineMcpServerRequest, mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* AddInlineMcpServer.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* AddInlineMcpServer.previewOrApply(candidate, execution(mode));
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

export const runMcpImport = (mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* ImportMcpServers.prepare();
    const resolution = yield* ImportMcpServers.previewOrApply(candidate, execution(mode));
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

/**
 * Driving the setup use case from this package's own tests and
 * specifications: settle the request, run it, and describe what it settled.
 * The bundled AXM skill is the application's step, so a feature-level run
 * reports it as not installed.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import type { WorkspaceStateOptions } from "@agentxm/workspace-kernel/workspace-state";
import { layer as WorkspaceLayerLive } from "@agentxm/workspace-kernel/workspace-state/live";

import { SetupWorkspace, type SetupWorkspaceRequest } from "./setup-workspace.js";

/** Bind setup's authority to its selected scope while the workspace is still absent. */
export const setupWorkspaceTestLayer = (options: WorkspaceStateOptions) =>
  Layer.provideMerge(
    Layer.merge(CodingAgentRepositoryLive, NativeWriteAuthorityLive),
    WorkspaceLayerLive({ ...options, allowUninitialized: true }),
  );

export const runSetup = (request: SetupWorkspaceRequest) =>
  Effect.gen(function* () {
    const prepared = yield* SetupWorkspace.prepare(request);
    if (prepared._tag === "ApprovalRequired") return prepared;
    const transition = yield* SetupWorkspace.previewOrApply(prepared);
    const outcome = yield* SetupWorkspace.report({
      candidate: prepared,
      transition,
      bundledSkill: { installed: false, version: "0.0.0-fixture" },
    });
    return { candidate: prepared, transition, outcome };
  }).pipe(Effect.provide(setupWorkspaceTestLayer(request)));

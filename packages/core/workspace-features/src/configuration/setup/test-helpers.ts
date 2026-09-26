/**
 * Driving the setup use case from this package's own tests and
 * specifications: settle the request, run it, and describe what it settled.
 * The bundled AXM skill is the application's step, so a feature-level run
 * reports it as not installed.
 */

import * as Effect from "effect/Effect";

import { SetupWorkspace, type SetupWorkspaceRequest } from "./setup-workspace.js";

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
  });

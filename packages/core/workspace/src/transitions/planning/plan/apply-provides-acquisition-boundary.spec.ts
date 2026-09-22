import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";

import { AcquiredContent } from "../../../acquisition/acquired-content.js";
import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";
import { StepFailure } from "./errors.js";
import { deriveOperationOutcome } from "./operation-resolution.js";
import type { Plan } from "./plan.js";
import { preapprovedPlanExecution } from "./plan-execution-fixtures.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";

export const specification = defineSpecification({
  requirement: "workspace/apply-provides-acquisition-boundary",
  title: "Every apply has a selected-content boundary",
  statement:
    "For every apply candidate, AXM shall provide an acquired-content context during the workspace transition, including candidates with no acquisition refs, so source-fetch adapters can refuse undeclared remote retrieval under the lock.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "The real plan executor and transaction scope expose the acquired-content context seen by a closure whose plan names no external acquisitions.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Acquisition boundary during apply", () => {
  it.effect("provides an empty acquired-content context to a source-free closure", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* makeSpecWorkspace("axm-unacquired-source-");
      let guarded = false;
      const plan: Plan = {
        _tag: "Plan",
        name: "Install review",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                key: "skill:review",
                label: "review",
                run: Effect.serviceOption(AcquiredContent).pipe(
                  Effect.flatMap((acquired) => {
                    guarded = Option.isSome(acquired) && acquired.value.requestedKeys.size === 0;
                    return guarded
                      ? Effect.succeed({ result: "success" as const, message: "guarded" })
                      : Effect.fail(
                          new StepFailure({
                            category: "internal",
                            detail: "Apply did not provide selected-content context",
                          }),
                        );
                  }),
                ),
              },
            ],
          },
        ],
      };
      const context = makeSpecContext(workspace.workspaceDir);
      const candidate = yield* prepareExecutionCandidate(plan).pipe(Effect.provide(context.layer));
      const result = yield* resolveExecutionCandidate(candidate, preapprovedPlanExecution).pipe(
        Effect.provide(context.layer),
      );

      expect(deriveOperationOutcome(result)).toBe("applied");
      expect(result.units[0]?.state).toBe("committed");
      expect(guarded).toBe(true);
      expect(yield* fs.readFileString(workspace.settingsPath)).toBe('{\n  "skills": {}\n}\n');
      expect(yield* fs.readFileString(workspace.lockPath)).toBe("lockfileVersion: 8\nskills: {}\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

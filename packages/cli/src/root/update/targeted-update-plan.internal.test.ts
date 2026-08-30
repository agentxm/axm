import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import type { JobStepResult, Plan } from "@agentxm/extension-management/unstable/plan";
import { WorkspaceMutations } from "@agentxm/extension-management/unstable/workspace";

import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { resolveTargetedUpdateContext } from "./targeted-update-context.js";
import { TARGETED_UPDATE_STALE_DETAIL, wrapTargetedUpdatePlan } from "./targeted-update-plan.js";

const target = {
  type: "skill" as const,
  name: "reviewer",
  fqn: "@acme/skills/reviewer",
};

describe("targeted update transaction", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "targeted-update-plan-test-"));
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      owner: "@acme",
      skills: { reviewer: target.fqn },
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const planWithStep = (run: Effect.Effect<JobStepResult, AppError>) =>
    ({
      _tag: "Plan",
      name: "Update reviewer",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [{ readiness: "ready", label: "reviewer", run }],
        },
      ],
    }) satisfies Plan;

  it.effect(
    "C-02: a stale ownership context resolves as typed stale-candidate blocking before the member step runs",
    () => {
      const { provide } = makeWorkspaceHandlerTestContext({
        wsOptions: { projectRoot: tempDir },
      });

      return provide(
        Effect.gen(function* () {
          let childRan = false;
          const context = yield* resolveTargetedUpdateContext({ target });
          const wrapped = yield* wrapTargetedUpdatePlan({
            plan: planWithStep(
              Effect.sync(() => {
                childRan = true;
                return { result: "success", message: "updated reviewer" };
              }),
            ),
            context,
          });
          writeWorkspaceFiles(path.join(tempDir, ".axm"), {
            owner: "@acme",
            skills: { reviewer: { source: target.fqn, enabled: false } },
          });
          const step = wrapped.jobs[0]?.steps[0];
          if (step === undefined || step.readiness === "error") {
            return yield* makeAppError({ code: "internal", detail: "Expected a runnable step" });
          }

          const result = yield* step.run;
          expect(result.result).toBe("error");
          if (result.result === "error") {
            expect(result.blocking?.class).toBe("stale-candidate");
            expect(result.message).toBe(TARGETED_UPDATE_STALE_DETAIL);
            expect(result.error.code).toBe("conflict");
          }
          expect(childRan).toBe(false);
        }),
      );
    },
  );

  it.effect("rolls back a member step that violates the ownership postcondition", () => {
    const { provide } = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        const workspace = yield* WorkspaceMutations;
        const settingsPath = path.join(tempDir, "axm.json");
        const settingsBefore = fs.readFileSync(settingsPath, "utf8");
        const context = yield* resolveTargetedUpdateContext({ target });
        const wrapped = yield* wrapTargetedUpdatePlan({
          plan: planWithStep(
            workspace.removeSkillFromSettings(target.name).pipe(
              Effect.map(() => ({
                result: "success" as const,
                message: "removed direct intent",
              })),
            ),
          ),
          context,
        });
        const step = wrapped.jobs[0]?.steps[0];
        if (step === undefined || step.readiness === "error") {
          return yield* makeAppError({ code: "internal", detail: "Expected a runnable step" });
        }

        const error = yield* step.run.pipe(Effect.flip);
        expect(error.code).toBe("internal");
        expect(error.detail).toContain("changed desired ownership");
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(settingsBefore);
      }),
    );
  });

  it.effect("preserves an unchanged child result through the atomic wrapper", () => {
    const { provide } = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        const context = yield* resolveTargetedUpdateContext({ target });
        const wrapped = yield* wrapTargetedUpdatePlan({
          plan: planWithStep(
            Effect.succeed({
              result: "success",
              message: "reviewer is already current",
              artifact: {
                path: target.fqn,
                scope: "project",
                change: "unchanged",
              },
            }),
          ),
          context,
        });
        const step = wrapped.jobs[0]?.steps[0];
        if (step === undefined || step.readiness === "error") {
          return yield* makeAppError({ code: "internal", detail: "Expected a runnable step" });
        }

        const result = yield* step.run;
        if (result.result === "error") {
          return yield* result.error;
        }
        expect(result.artifact?.change).toBe("unchanged");
      }),
    );
  });
});

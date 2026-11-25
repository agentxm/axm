import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { StepFailure, type JobStepResult } from "@agentxm/workspace-kernel/operations";
import { applyPlan } from "@agentxm/workspace-kernel/planning";

import { buildPublishJobs } from "./jobs.js";

const at = <T>(values: ReadonlyArray<T>, index: number): T => {
  const value = values[index];
  if (value == null) throw new Error(`Expected value at index ${index}`);
  return value;
};

describe("publish dependency planning", () => {
  const success: JobStepResult = { result: "success", message: "Published" };
  const stepFor = (candidate: { readonly fqn: string }) => ({
    readiness: "ready" as const,
    label: `Publish ${candidate.fqn}`,
    run: Effect.succeed(success),
  });

  it("records selected pack dependencies as causal execution edges", () => {
    const dependency = {
      fqn: "@acme/skills/review",
      type: "skill",
    } as const;
    const pack = {
      fqn: "@acme/packs/toolkit",
      type: "pack",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    } as const;

    const jobs = buildPublishJobs([dependency, pack], stepFor);

    expect(jobs).toHaveLength(1);
    expect(at(jobs, 0)).toMatchObject({
      concurrency: 4,
      executionPolicy: "best-effort",
    });
    expect(at(jobs, 0).steps.map((step) => step.label)).toEqual([
      "Publish @acme/skills/review",
      "Publish @acme/packs/toolkit",
    ]);
    expect(at(at(jobs, 0).steps, 1).dependsOn).toEqual(["@acme/skills/review"]);
  });

  it("does not broaden a pack-only selection", () => {
    const pack = {
      fqn: "@acme/packs/toolkit",
      type: "pack",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    } as const;

    const jobs = buildPublishJobs([pack], stepFor);

    expect(jobs).toHaveLength(1);
    expect(at(jobs, 0).steps.map((step) => step.label)).toEqual(["Publish @acme/packs/toolkit"]);
  });

  it.effect("blocks packs when a selected dependency fails", () =>
    Effect.gen(function* () {
      const dependency = {
        fqn: "@acme/skills/review",
        type: "skill",
      } as const;
      const pack = {
        fqn: "@acme/packs/toolkit",
        type: "pack",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      } as const;
      const jobs = buildPublishJobs([dependency, pack], (candidate) => ({
        readiness: "ready",
        label: `Publish ${candidate.fqn}`,
        run:
          candidate.type === "skill"
            ? Effect.fail(new StepFailure({ category: "conflict", detail: "Dependency failed" }))
            : Effect.succeed(success),
      }));

      const executed = yield* applyPlan({
        _tag: "Plan",
        name: "Publish extensions",
        description: Option.none(),
        jobs,
      });

      expect(at(at(executed.jobs, 0).steps, 0).result.result).toBe("error");
      expect(at(at(executed.jobs, 0).steps, 1)).toMatchObject({
        blockedBy: ["@acme/skills/review"],
        result: {
          result: "error",
          message: "blocked by failed dependency: @acme/skills/review",
        },
      });
    }),
  );

  it.effect("continues independent candidates after a dependency failure", () =>
    Effect.gen(function* () {
      const dependency = { fqn: "@acme/skills/review", type: "skill" } as const;
      const independent = { fqn: "@acme/skills/format", type: "skill" } as const;
      const pack = {
        fqn: "@acme/packs/toolkit",
        type: "pack",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      } as const;
      const jobs = buildPublishJobs([dependency, pack, independent], (candidate) => ({
        readiness: "ready",
        label: `Publish ${candidate.fqn}`,
        run:
          candidate.fqn === dependency.fqn
            ? Effect.fail(new StepFailure({ category: "conflict", detail: "Dependency failed" }))
            : Effect.succeed(success),
      }));

      const executed = yield* applyPlan({
        _tag: "Plan",
        name: "Publish extensions",
        description: Option.none(),
        jobs,
      });

      expect(at(at(executed.jobs, 0).steps, 1).blockedBy).toEqual([dependency.fqn]);
      expect(at(at(executed.jobs, 0).steps, 2).result.result).toBe("success");
    }),
  );
});

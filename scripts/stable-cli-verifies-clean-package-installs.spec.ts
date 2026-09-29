import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { readReleaseWorkflow } from "./release-workflow-graph.js";

export const specification = defineSpecification({
  requirement: "system/process/stable-cli-verifies-clean-package-installs",
  title: "Stable CLI verifies clean package-manager installs",
  statement:
    "A stable CLI release shall verify that its published npm package executes from clean global npm, pnpm, and Yarn Classic installations and reports the exact release version; failure of any declared verification shall prevent the release from being reported complete.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The canonical publication workflow owns clean-install verification and its completion gate.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Stable CLI package installation", () => {
  it.effect("requires clean installations under each supported package manager", () =>
    Effect.sync(() => {
      const workflow = readReleaseWorkflow();
      const verification = workflow.jobs["package-verify"];
      const summary = workflow.jobs["summary"];
      expect(verification?.needs).toBe("release");
      expect(verification?.["continue-on-error"]).not.toBe(true);
      expect(verification?.strategy?.matrix.include).toEqual(
        expect.arrayContaining([
          { os: "ubuntu-latest", manager: "npm" },
          { os: "ubuntu-latest", manager: "pnpm" },
          { os: "ubuntu-latest", manager: "yarn" },
        ]),
      );
      expect(
        verification?.steps.some(
          (step) =>
            step.run?.includes("axm:verify-installed-package") &&
            step.run.includes("matrix.manager") &&
            step.run.includes("needs.release.outputs.version"),
        ),
      ).toBe(true);
      expect(summary?.needs).toContain("package-verify");
      expect(
        summary?.steps.some(
          (step) => step.run?.includes("package-verify") && step.run.includes("success"),
        ),
      ).toBe(true);
    }),
  );
});

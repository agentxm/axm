import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProjectWithHome, lintServices } from "../test-helpers.js";
import { makeLintWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-missing-settings-as-finding",
  title: "Lint reports a folder without workspace settings instead of refusing to run",
  statement:
    "When the selected scope has no workspace settings, lint shall complete and report the missing settings file as an error under workspace/initialized alongside its other findings, and shall not create the settings file.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "A missing settings file is a real absence in a folder on disk; the lint feature over live workspace services decides whether the run completes and what it reports.",
  derivedFrom: ["apps/cli-e2e/src/cli-commands/lint/command.e2e.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Missing settings", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("completes with a workspace/initialized error and creates nothing", () => {
    const project = makeLintWorkspace();
    project.remove("axm.json");
    const home = makeLintWorkspace();
    cleanups.push(project.cleanup, home.cleanup);
    return Effect.gen(function* () {
      const before = project.snapshot();
      const { document, outcome } = yield* lintProjectWithHome(project, home.root);
      expect(outcome).toBe("fail");
      expect(
        document.findings
          .filter(({ ruleId }) => ruleId === "workspace/initialized")
          .map(({ severity, message, location }) => ({ severity, message, file: location?.file })),
      ).toEqual([
        {
          severity: "error",
          message: "The workspace settings file is missing.",
          file: "axm.json",
        },
      ]);
      expect(project.exists("axm.json")).toBe(false);
      expect(project.snapshot()).toEqual(before);
    }).pipe(Effect.provide(lintServices(project)));
  });
});

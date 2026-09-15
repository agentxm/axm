import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintServices } from "../test-helpers.js";
import { CLAUDE_CODE_SKILLS_DIR, makeOfficialAxmSkillWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-facts-without-mutation",
  title: "Lint preserves workspace files whether the run succeeds or fails",
  statement:
    "When lint runs without --fix, it shall preserve every workspace file, directory, symbolic link, and file's contents whether the run succeeds or fails.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "The workspace is a real directory of files, directories and symbolic links, so the whole-tree snapshot before and after is the decisive evidence; nothing about the guarantee needs a separate process.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Lint reports facts without mutation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "a broken invariant is reported with a failing outcome while every byte of workspace state survives",
    () => {
      const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
      cleanups.push(workspace.cleanup);
      // Break an invariant: remove the realized agent projection while the
      // declaration and the canonical package still require it.
      workspace.remove(`${CLAUDE_CODE_SKILLS_DIR}/axm`);
      const before = workspace.snapshot();

      return Effect.gen(function* () {
        const result = yield* lintProject(workspace);

        expect(result.outcome).toBe("fail");
        expect(result.document.summary.exitCategory).toBe("errors");
        expect(result.document.summary.errors).toBeGreaterThanOrEqual(1);
        expect(result.document.findings.length).toBeGreaterThanOrEqual(1);

        expect(workspace.snapshot()).toEqual(before);
        expect(workspace.exists(`${CLAUDE_CODE_SKILLS_DIR}/axm`)).toBe(false);
      }).pipe(Effect.provide(lintServices(workspace)));
    },
  );

  it.effect("a valid workspace reports clean and succeeds", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
    cleanups.push(workspace.cleanup);
    const before = workspace.snapshot();

    return Effect.gen(function* () {
      const result = yield* lintProject(workspace);

      expect(result.outcome).toBe("success");
      expect(result.document.summary.exitCategory).toBe("clean");
      expect(result.document.findings).toEqual([]);

      expect(workspace.snapshot()).toEqual(before);
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});

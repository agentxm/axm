import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { InstructionMaintenanceFailed } from "@agentxm/workspace-projection";
import { defineSpecification } from "@agentxm/specification-metadata";

import { fixProject, lintServices } from "../test-helpers.js";
import { makeOfficialAxmSkillWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/fix-repairs-only-determined-state",
  title: "Lint fix requires known ownership and unambiguous content",
  statement:
    "When lint runs with --fix, it shall repair only state that local authority fully determines, such as a missing instruction alias, and shall fail with a conflict without touching the workspace when a target is unowned or its desired content is ambiguous.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "A repair is a write to a real working tree, so the decisive evidence is the tree itself: the alias that appears, and the authored file that is still byte-identical afterwards.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** A workspace that manages its instruction files, with the source present. */
const managedInstructions = {
  instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
} as const;

describe("Lint determined repairs", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("restores a missing instruction alias and leaves authoritative state unchanged", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible", {
      settings: managedInstructions,
      files: { "AGENTS.md": "# Workspace\n" },
    });
    cleanups.push(workspace.cleanup);
    expect(workspace.exists("CLAUDE.md")).toBe(false);
    const settingsBefore = workspace.readFile("axm.json");
    const sourceBefore = workspace.readFile("AGENTS.md");

    return Effect.gen(function* () {
      const result = yield* fixProject(workspace);

      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readFile("AGENTS.md")).toBe(sourceBefore);
      const alias = nodePath.join(workspace.root, "CLAUDE.md");
      expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(alias)).toBe("AGENTS.md");

      expect(result.outcome).toBe("success");
      expect(result.document.findings).toEqual([]);
      expect(result.document.summary.exitCategory).toBe("clean");
    }).pipe(Effect.provide(lintServices(workspace)));
  });

  it.effect(
    "does not replace an unowned instruction target whose desired content is ambiguous",
    () => {
      const privateNotes = "# Private Claude notes\n\nIrreplaceable.\n";
      const workspace = makeOfficialAxmSkillWorkspace("official-compatible", {
        settings: managedInstructions,
        files: { "AGENTS.md": "# Workspace\n", "CLAUDE.md": privateNotes },
      });
      cleanups.push(workspace.cleanup);
      const treeBefore = workspace.snapshot();

      return Effect.gen(function* () {
        const failure = yield* Effect.flip(fixProject(workspace));

        expect(failure).toBeInstanceOf(InstructionMaintenanceFailed);
        if (!(failure instanceof InstructionMaintenanceFailed)) return;
        expect(failure.category).toBe("conflict");
        expect(failure.detail).toContain("CLAUDE.md");
        expect(failure.detail).toMatch(/unowned|unknown ownership|not managed/i);

        expect(fs.lstatSync(nodePath.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(
          false,
        );
        expect(workspace.readFile("CLAUDE.md")).toBe(privateNotes);
        expect(workspace.snapshot()).toEqual(treeBefore);
      }).pipe(Effect.provide(lintServices(workspace)));
    },
  );
});

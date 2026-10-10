import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { RegistryClientFactory } from "@agentxm/registry-client";

import { LintWorkspace } from "../index.js";
import { lintServices, projectSelection } from "../test-helpers.js";
import { makeOfficialAxmSkillWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/preview-is-pure",
  title: "Lint fix preview describes offline normalization without applying it",
  statement:
    "When lint runs with --fix --preview, it shall report eligible instruction-alias normalization without changing workspace state or accessing a registry, and applying the same local state shall normalize those aliases without performing general workspace reconciliation.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/lint/fix-repairs-only-determined-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Lint normalization preview", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "reports the missing alias, preserves every file, then applies only normalization",
    () => {
      const workspace = makeOfficialAxmSkillWorkspace("official-compatible", {
        settings: {
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        },
        files: { "AGENTS.md": "# Workspace\n", "unrelated.txt": "Preserve me\n" },
      });
      cleanups.push(workspace.cleanup);
      const before = workspace.snapshot();
      const settingsBefore = workspace.readFile("axm.json");
      const selection = projectSelection(workspace, true);
      const noRegistryAccess = {
        forLocation: () => Effect.die("Lint normalization accessed a registry"),
        forDefaultRegistry: Effect.die("Lint normalization accessed the default registry"),
      };
      return Effect.gen(function* () {
        const preview = yield* LintWorkspace.fix(selection, { strict: false, preview: true });
        expect(workspace.snapshot()).toEqual(before);
        expect(preview.document.repaired).toEqual([]);
        expect(preview.document.normalization).toMatchObject({
          mode: "preview",
          changes: expect.arrayContaining([
            { path: `${workspace.root}/CLAUDE.md`, change: "created" },
          ]),
        });
        expect(workspace.exists("CLAUDE.md")).toBe(false);

        const applied = yield* LintWorkspace.fix(selection, { strict: false });
        expect(workspace.exists("CLAUDE.md")).toBe(true);
        expect(workspace.readFile("CLAUDE.md")).toBe("# Workspace\n");
        expect(workspace.readFile("unrelated.txt")).toBe("Preserve me\n");
        expect(workspace.readFile("axm.json")).toBe(settingsBefore);
        expect(applied.document.normalization).toBeUndefined();
        expect(applied.document.repaired.length).toBeGreaterThan(0);
      }).pipe(
        Effect.provideService(RegistryClientFactory, noRegistryAccess),
        Effect.provide(lintServices(workspace)),
      );
    },
  );
});

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  handleInstructionsDisable,
  handleInstructionsEnable,
  expectAppliedPlanResult,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/disable/removes-only-owned-aliases",
  title: "Disabling instruction-file management removes only what AXM owns",
  statement:
    "When instruction-file management is disabled, AXM shall record the choice in axm.json and remove only the alias files and ignore regions it owns, and shall preserve authored instruction content and unrelated ignore entries.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/management-is-explicit"],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [
    "When a configured alias path contains an unowned human file, current disable refuses the whole operation; decide whether disabling should preserve that file and still record disabled management. The current preservation promise does not independently choose that policy.",
  ],
});

describe("Disabling instruction-file management", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "disabling removes only owned aliases and regions while preserving authored prose",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        fs.mkdirSync(path.join(workspace.root, ".git"));
        fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Authored instructions\n");
        fs.writeFileSync(path.join(workspace.root, ".gitignore"), "dist/\n");
        yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
          Effect.provide(workspace.layer),
        );

        yield* handleInstructionsDisable().pipe(Effect.provide(workspace.layer));

        expect(workspace.readSettings()).toMatchObject({ instructionFiles: false });
        expect(workspace.exists("CLAUDE.md")).toBe(false);
        expect(workspace.readFile("AGENTS.md")).toBe("# Authored instructions\n");
        expect(workspace.readFile(".gitignore")).toContain("dist/");
        expect(workspace.readFile(".gitignore")).not.toContain("region=instruction-aliases");
      }),
  );
  it.effect("removes stale owned aliases while preserving an unrelated instruction file", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true });
      cleanups.push(workspace.cleanup);
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "Authored instructions.\n");
      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false }).pipe(
        Effect.provide(workspace.layer),
      );
      fs.symlinkSync("AGENTS.md", path.join(workspace.root, "GEMINI.md"));
      fs.writeFileSync(path.join(workspace.root, "IFLOW.md"), "Unowned instruction content.\n");
      yield* handleInstructionsDisable().pipe(Effect.provide(workspace.layer));
      expectAppliedPlanResult(workspace.rendererState.results.at(-1)?.data, {
        planName: "Disable instruction-file management",
      });
      expect(workspace.readSettings()).toMatchObject({ instructionFiles: false });
      expect(workspace.exists("CLAUDE.md")).toBe(false);
      expect(workspace.exists("GEMINI.md")).toBe(false);
      expect(workspace.readFile("AGENTS.md")).toBe("Authored instructions.\n");
      expect(workspace.readFile("IFLOW.md")).toBe("Unowned instruction content.\n");
    }),
  );
});

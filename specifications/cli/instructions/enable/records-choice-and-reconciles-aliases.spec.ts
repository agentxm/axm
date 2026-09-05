import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { handleInstructionsEnable } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/enable/records-choice-and-reconciles-aliases",
  title:
    "Enabling instruction-file management records the explicit choice and reconciles aliases together",
  statement:
    "When instruction-file management is enabled, AXM shall record the explicit choice and its source file in axm.json and shall reconcile the alias files and ignore regions it owns in the same operation.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/management-is-explicit"],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [],
});

describe("Enabling instruction-file management", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("enabling records the explicit choice and reconciles aliases as one operation", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      fs.mkdirSync(path.join(workspace.root, ".git"));
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Authored instructions\n");
      fs.writeFileSync(path.join(workspace.root, ".gitignore"), "dist/\n");

      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expect(workspace.readSettings()).toMatchObject({
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      });
      expect(fs.lstatSync(path.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(workspace.readFile(".gitignore")).toContain("region=instruction-aliases");
    }),
  );
});

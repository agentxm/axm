import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  expectNoOpPlanResult,
  handleInstructionsDisable,
  handleInstructionsEnable,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/disable/disable-is-idempotent",
  title: "Disabling already disabled instruction-file management is a successful no-op",
  statement:
    "When instruction-file management is disabled while already disabled, AXM shall report a no-op outcome and shall not change settings.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/management-is-explicit"],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [],
});

describe("Repeat instruction-file disables are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("disabling an already-disabled capability changes nothing and says so", () =>
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
      const settingsBefore = workspace.readFile("axm.json");

      yield* handleInstructionsDisable().pipe(Effect.provide(workspace.layer));

      const lastResult = workspace.rendererState.results.at(-1);
      expectNoOpPlanResult(lastResult?.data, {
        planName: "Disable instruction-file management",
        message: "Instruction-file management is already disabled.",
      });
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
    }),
  );
});

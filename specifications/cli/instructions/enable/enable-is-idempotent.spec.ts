import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { handleInstructionsEnable, expectNoOpPlanResult } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/enable/enable-is-idempotent",
  title: "Enabling the same instruction configuration is a successful no-op",
  statement:
    "When instruction-file management is enabled with the already-current source file and ignore policy, AXM shall report a no-op and leave settings, source content, aliases and ignore entries unchanged.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/instructions.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Repeated instruction enable", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const gitignore of [true, false])
    it.effect(
      `keeps an already-current instruction configuration with gitignore=${gitignore}`,
      () =>
        Effect.gen(function* () {
          const workspace = makeSpecWorkspace({ machine: true });
          cleanups.push(workspace.cleanup);
          fs.mkdirSync(path.join(workspace.root, ".git"));
          fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "Authored instructions.\n");
          fs.writeFileSync(path.join(workspace.root, ".gitignore"), "build/\n");
          yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore }).pipe(
            Effect.provide(workspace.layer),
          );
          const before = snapshotWorkspaceContent(workspace.root);
          yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore }).pipe(
            Effect.provide(workspace.layer),
          );
          expectNoOpPlanResult(workspace.rendererState.results.at(-1)?.data, {
            planName: "Enable instruction-file management",
          });
          expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
        }),
    );
});

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { handleInstructionsEnable, handleInstructionsStatus } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/status-reports-without-changing-state",
  title: "Instruction-file status is inspected without changing workspace state",
  statement:
    "When instruction-file management status is inspected, AXM shall report whether management is enabled and, when it is, the source file and the managed target for each configured agent, and shall not change settings or instruction files.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/management-is-explicit"],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [],
});

describe("Instruction-file status", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const instructionsWorkspace = () => {
    const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
    cleanups.push(workspace.cleanup);
    fs.mkdirSync(path.join(workspace.root, ".git"));
    fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Authored instructions\n");
    fs.writeFileSync(path.join(workspace.root, ".gitignore"), "dist/\n");
    return workspace;
  };

  it.effect("reports the capability as not configured without changing state", () =>
    Effect.gen(function* () {
      const workspace = instructionsWorkspace();
      const settingsBefore = workspace.readFile("axm.json");

      yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));

      expect(workspace.rendererState.results[0]?.data).toMatchObject({ enabled: false });
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.exists("CLAUDE.md")).toBe(false);
    }),
  );

  it.effect("reports the managed target for each configured agent without changing state", () =>
    Effect.gen(function* () {
      const workspace = instructionsWorkspace();
      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
        Effect.provide(workspace.layer),
      );
      const settingsBefore = workspace.readFile("axm.json");
      const ignoreBefore = workspace.readFile(".gitignore");

      yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));

      const status = workspace.rendererState.results.at(-1);
      expect(status?.data).toMatchObject({
        enabled: true,
        sourceFileName: "AGENTS.md",
        items: [expect.objectContaining({ agentId: "claude-code" })],
      });
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readFile(".gitignore")).toBe(ignoreBefore);
      expect(workspace.readFile("AGENTS.md")).toBe("# Authored instructions\n");
    }),
  );
});

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  expectNoOpPlanResult,
  handleInstructionsDisable,
  handleInstructionsEnable,
  handleInstructionsStatus,
} from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/management-is-explicit",
  title: "Instruction-file management is inspected, enabled, and disabled explicitly",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
});

describe("Instruction-file management", () => {
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

  const enable = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
      Effect.provide(workspace.layer),
    );

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

  it.effect("enabling records the explicit choice and reconciles aliases as one operation", () =>
    Effect.gen(function* () {
      const workspace = instructionsWorkspace();

      yield* enable(workspace);

      expect(workspace.readSettings()).toMatchObject({
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      });
      expect(fs.lstatSync(path.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(workspace.readFile(".gitignore")).toContain("region=instruction-aliases");
    }),
  );

  it.effect("reports the managed target for each configured agent", () =>
    Effect.gen(function* () {
      const workspace = instructionsWorkspace();
      yield* enable(workspace);

      yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));

      const status = workspace.rendererState.results.at(-1);
      expect(status?.data).toMatchObject({
        enabled: true,
        sourceFileName: "AGENTS.md",
        items: [expect.objectContaining({ agentId: "claude-code" })],
      });
    }),
  );

  it.effect(
    "disabling removes only owned aliases and regions while preserving authored prose",
    () =>
      Effect.gen(function* () {
        const workspace = instructionsWorkspace();
        yield* enable(workspace);

        yield* handleInstructionsDisable().pipe(Effect.provide(workspace.layer));

        const settings = workspace.readSettings();
        expect(settings).toMatchObject({ instructionFiles: false });
        expect(workspace.exists("CLAUDE.md")).toBe(false);
        expect(workspace.readFile("AGENTS.md")).toBe("# Authored instructions\n");
        expect(workspace.readFile(".gitignore")).toContain("dist/");
        expect(workspace.readFile(".gitignore")).not.toContain("region=instruction-aliases");
      }),
  );

  it.effect("disabling an already-disabled capability changes nothing and says so", () =>
    Effect.gen(function* () {
      const workspace = instructionsWorkspace();
      yield* enable(workspace);
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

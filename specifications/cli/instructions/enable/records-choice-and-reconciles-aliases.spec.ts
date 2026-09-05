import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  handleInstructionsEnable,
  PlanResolutionDocumentSchema,
  expectAppliedPlanResult,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

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
  it.effect(
    "changes the selected source and owned alias without editing either authored document",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true });
        cleanups.push(workspace.cleanup);
        fs.writeFileSync(
          path.join(workspace.root, "AGENTS.md"),
          "Original authored instructions.\n",
        );
        fs.writeFileSync(path.join(workspace.root, "TEAM.md"), "Selected team instructions.\n");
        yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false }).pipe(
          Effect.provide(workspace.layer),
        );
        yield* handleInstructionsEnable({ fileName: "TEAM.md", gitignore: false }).pipe(
          Effect.provide(workspace.layer),
        );
        expectAppliedPlanResult(workspace.rendererState.results.at(-1)?.data, {
          planName: "Enable instruction-file management",
        });
        expect(workspace.readSettings()).toMatchObject({
          instructionFiles: { fileName: "TEAM.md", gitignoreAliases: false },
        });
        expect(fs.readlinkSync(path.join(workspace.root, "CLAUDE.md"))).toBe("TEAM.md");
        expect(workspace.readFile("AGENTS.md")).toBe("Original authored instructions.\n");
        expect(workspace.readFile("TEAM.md")).toBe("Selected team instructions.\n");
      }),
  );
  it.effect("restores settings and aliases when the owned ignore region cannot be reconciled", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true });
      cleanups.push(workspace.cleanup);
      fs.mkdirSync(path.join(workspace.root, ".git"));
      fs.mkdirSync(path.join(workspace.root, ".gitignore"));
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "Human instructions.\n");
      const before = snapshotWorkspaceContent(workspace.root);
      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
        Effect.provide(workspace.layer),
      );
      const document = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
      expect(document.result.outcome).toBe("failed");
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
    }),
  );
  it.effect(
    "refuses malformed ownership markers before changing settings or any affected alias",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          recordWrites: true,
          settings: {
            agents: ["claude-code"],
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
          },
        });
        cleanups.push(workspace.cleanup);
        fs.mkdirSync(path.join(workspace.root, ".git"));
        fs.writeFileSync(
          path.join(workspace.root, "AGENTS.md"),
          "Preserved authored instructions.\n",
        );
        fs.writeFileSync(path.join(workspace.root, "unrelated.txt"), "Unrelated human bytes.\n");
        fs.symlinkSync("AGENTS.md", path.join(workspace.root, "GEMINI.md"));
        const malformed =
          "dist/\n# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n/GEMINI.md\n";
        fs.writeFileSync(path.join(workspace.root, ".gitignore"), malformed);
        // A real reconciliation would create CLAUDE.md, remove stale GEMINI.md,
        // and rewrite the ignore region. Ambiguous ownership must stop all three.
        const protectedPaths = [...WORKSPACE_PROTECTED_STATE, "GEMINI.md", "unrelated.txt"];
        const before = snapshotProtectedState(workspace.root, protectedPaths);
        const allBytesBefore = snapshotWorkspaceContent(workspace.root);
        workspace.writes.splice(0);

        yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
          Effect.provide(workspace.layer),
        );

        const document = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(document.result.outcome).toBe("blocked");
        expect(document.result.counts.committed).toBe(0);
        expect(document.result.blocking?.detail).toContain("malformed AXM ownership markers");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
          protectedPaths,
        });
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(allBytesBefore);
        expect(workspace.exists("CLAUDE.md")).toBe(false);
        expect(fs.readlinkSync(path.join(workspace.root, "GEMINI.md"))).toBe("AGENTS.md");
        expect(workspace.readFile(".gitignore")).toBe(malformed);
      }),
  );
});

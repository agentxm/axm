import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  handleInstructionsEnable,
  handleInstructionsDisable,
  handleInstructionsStatus,
  InstructionsStatusOutputSchema,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/status-reports-without-changing-state",
  title: "Instruction-file status is inspected without changing workspace state",
  statement:
    "When instruction-file management status is inspected, AXM shall report whether management is enabled and, when it is, the source file and the managed target for each configured agent together with stale owned aliases, and shall not change settings or instruction files.",
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
  it.effect("reports an explicit disabled choice without changing content", () =>
    Effect.gen(function* () {
      const workspace = instructionsWorkspace();
      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true }).pipe(
        Effect.provide(workspace.layer),
      );
      yield* handleInstructionsDisable().pipe(Effect.provide(workspace.layer));
      const before = snapshotWorkspaceContent(workspace.root);
      yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));
      expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
        enabled: false,
        items: [],
        staleTargets: [],
      });
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
    }),
  );
  it.effect("reports enabled management with no configured agent targets", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, settings: { agents: [] } });
      cleanups.push(workspace.cleanup);
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "Authored instructions.\n");
      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false }).pipe(
        Effect.provide(workspace.layer),
      );
      const before = snapshotWorkspaceContent(workspace.root);
      yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));
      expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
        enabled: true,
        sourceFileName: "AGENTS.md",
        items: [],
        staleTargets: [],
      });
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
    }),
  );
  it.effect("distinguishes a current configured alias from a stale owned alias", () =>
    Effect.gen(function* () {
      const workspace = instructionsWorkspace();
      yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: false }).pipe(
        Effect.provide(workspace.layer),
      );
      fs.symlinkSync("AGENTS.md", path.join(workspace.root, "GEMINI.md"));
      fs.writeFileSync(path.join(workspace.root, "IFLOW.md"), "Unowned instruction content.\n");
      const before = snapshotWorkspaceContent(workspace.root);
      yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));
      expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
        enabled: true,
        items: [
          expect.objectContaining({
            agentId: "claude-code",
            health: "ok",
            ownership: "owned-current",
            observedForm: "symlink",
          }),
        ],
        staleTargets: [
          expect.objectContaining({
            agentId: "gemini-cli",
            health: "stale",
            targetFile: path.join(workspace.root, "GEMINI.md"),
          }),
        ],
      });
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
    }),
  );
  it.effect("reports a missing selected source without creating the source or its alias", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        settings: {
          agents: ["claude-code"],
          instructionFiles: { fileName: "TEAM.md", gitignoreAliases: false },
        },
      });
      cleanups.push(workspace.cleanup);
      fs.writeFileSync(path.join(workspace.root, "unrelated.txt"), "Authored unrelated bytes.\n");
      const before = snapshotWorkspaceContent(workspace.root);

      yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));

      const report = yield* Schema.decodeUnknownEffect(InstructionsStatusOutputSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
      expect(report.enabled).toBe(true);
      expect(report.sourceFileName).toBe("TEAM.md");
      expect(report.missingSources).toEqual([path.join(workspace.root, "TEAM.md")]);
      expect(report.items).toEqual([
        expect.objectContaining({
          agentId: "claude-code",
          sourceFile: path.join(workspace.root, "TEAM.md"),
          targetFile: path.join(workspace.root, "CLAUDE.md"),
          health: "missing-source",
          ownership: "absent",
          observedForm: "none",
        }),
      ]);
      expect(report.staleTargets).toEqual([]);
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
    }),
  );

  it.effect(
    "distinguishes supported instruction sources from native rules directories it does not write",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          settings: {
            agents: ["cursor", "roo", "codex"],
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          },
        });
        cleanups.push(workspace.cleanup);
        fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "Shared authored instructions.\n");
        const before = snapshotWorkspaceContent(workspace.root);

        yield* handleInstructionsStatus().pipe(Effect.provide(workspace.layer));

        const report = yield* Schema.decodeUnknownEffect(InstructionsStatusOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(report.missingSources).toEqual([]);
        expect(report.items.map((item) => item.agentId).sort()).toEqual(["codex", "cursor", "roo"]);
        expect(report.items.find((item) => item.agentId === "roo")).toMatchObject({
          mechanism: "adapter",
          health: "unsupported",
          ownership: "absent",
          observedForm: "none",
        });
        expect(report.items.find((item) => item.agentId === "roo")?.details).toContain(
          ".roo/rules",
        );
        expect(report.items.find((item) => item.agentId === "cursor")).toMatchObject({
          sourceFile: path.join(workspace.root, "AGENTS.md"),
          targetFile: path.join(workspace.root, "AGENTS.md"),
          mechanism: "native",
          health: "ok",
        });
        expect(report.items.find((item) => item.agentId === "cursor")?.details).toContain(
          ".cursor/rules",
        );
        expect(report.items.find((item) => item.agentId === "cursor")?.details).toMatch(
          /not (?:yet )?synced by AXM/u,
        );
        expect(report.items.find((item) => item.agentId === "codex")).toMatchObject({
          mechanism: "native",
          health: "ok",
        });
        expect(workspace.exists(".roo")).toBe(false);
        expect(workspace.exists(".cursor")).toBe(false);
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
  );
});

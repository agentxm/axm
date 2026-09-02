import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";

import { getAppError, handleLint, LintResultDocumentSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { installBundledAxmSkill, makeLintSpecWorkspace } from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/fix-repairs-only-determined-state",
  title: "Lint fix repairs only state determined by local authority",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
});

const decodeDocument = Schema.decodeUnknownEffect(LintResultDocumentSchema);

const enableInstructionManagement = (workspace: ReturnType<typeof makeLintSpecWorkspace>): void => {
  const settings = workspace.readSettings();
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new Error("Expected object-valued workspace settings");
  }
  fs.writeFileSync(
    path.join(workspace.root, "axm.json"),
    `${JSON.stringify(
      {
        ...settings,
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      },
      null,
      2,
    )}\n`,
  );
};

describe("Lint determined repairs", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("restores a missing instruction alias and leaves authoritative state unchanged", () =>
    Effect.gen(function* () {
      const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
      enableInstructionManagement(workspace);
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Workspace\n");
      expect(workspace.exists("CLAUDE.md")).toBe(false);
      const settingsBefore = workspace.readFile("axm.json");
      const lockBefore = workspace.readLockfileText();
      const sourceBefore = workspace.readFile("AGENTS.md");

      const exit = yield* handleLint({
        pathArg: Option.some(workspace.root),
        scope: "project",
        strict: false,
        details: false,
        fix: true,
        input: { view: "workspace" },
      }).pipe(Effect.provide(workspace.layer), Effect.exit);

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockBefore);
      expect(workspace.readFile("AGENTS.md")).toBe(sourceBefore);
      expect(fs.lstatSync(path.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(path.join(workspace.root, "CLAUDE.md"))).toBe("AGENTS.md");

      const entry = workspace.rendererState.results.at(-1);
      expect(entry?.ok).toBe(true);
      const document = yield* decodeDocument(entry?.data);
      expect(document.result.findings).toEqual([]);
      expect(document.result.summary.exitCategory).toBe("clean");
    }),
  );

  it.effect(
    "does not replace an unowned instruction target whose desired content is ambiguous",
    () =>
      Effect.gen(function* () {
        const workspace = makeLintSpecWorkspace({
          machine: true,
          flags: { json: true },
        });
        cleanups.push(workspace.cleanup);
        yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
        enableInstructionManagement(workspace);
        fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), "# Workspace\n");
        const privateNotes = "# Private Claude notes\n\nIrreplaceable.\n";
        fs.writeFileSync(path.join(workspace.root, "CLAUDE.md"), privateNotes);
        const treeBefore = workspace.snapshotTree("");
        const resultCountBefore = workspace.rendererState.results.length;

        const failure = yield* handleLint({
          pathArg: Option.some(workspace.root),
          scope: "project",
          strict: false,
          details: false,
          fix: true,
          input: { view: "workspace" },
        }).pipe(Effect.provide(workspace.layer), Effect.flip);

        const error = getAppError(failure);
        expect(error.code).toBe("conflict");
        expect(error.detail).toContain("CLAUDE.md");
        expect(error.detail).toMatch(/unowned|unknown ownership|not managed/i);
        expect(fs.lstatSync(path.join(workspace.root, "CLAUDE.md")).isSymbolicLink()).toBe(false);
        expect(workspace.readFile("CLAUDE.md")).toBe(privateNotes);
        expect(workspace.snapshotTree("")).toEqual(treeBefore);
        expect(workspace.rendererState.results).toHaveLength(resultCountBefore);
      }),
  );
});

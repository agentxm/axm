import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { LintResultDocumentSchema, handleInstall, handleLint } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalSkillPackage } from "../../support/install-harness.js";
import { installBundledAxmSkill, makeLintSpecWorkspace } from "../../support/lint-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-facts-without-mutation",
  title: "Lint preserves workspace files whether the run succeeds or fails",
  statement:
    "When lint runs without --fix, it shall preserve every workspace file, directory, symbolic link, and file's contents whether the run succeeds or fails.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeDocument = Schema.decodeUnknownEffect(LintResultDocumentSchema);

const lint = (root: string) =>
  handleLint({
    pathArg: Option.some(root),
    scope: "project",
    strict: false,
    details: false,
    fix: false,
    input: { view: "workspace" },
  });

describe("Lint reports facts without mutation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "a broken invariant is reported with a failing exit while every byte of workspace state survives",
    () =>
      Effect.gen(function* () {
        const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
        const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
        yield* handleInstall({
          source: Option.some(skillPackage),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        // Break an invariant: remove the realized agent projection while the
        // desired state, lock state, and canonical content still require it.
        fs.rmSync(path.join(workspace.root, ".claude", "skills", "code-review"), {
          recursive: true,
        });

        const before = snapshotWorkspaceContent(workspace.root);

        const exit = yield* lint(workspace.root).pipe(Effect.provide(workspace.layer), Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);

        const entry = workspace.rendererState.results.at(-1);
        expect(entry?.ok).toBe(false);
        const document = yield* decodeDocument(entry?.data);
        expect(document.result.summary.exitCategory).toBe("errors");
        expect(document.result.summary.errors).toBeGreaterThanOrEqual(1);
        expect(document.result.findings.length).toBeGreaterThanOrEqual(1);

        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
        expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      }),
  );

  it.effect("a valid workspace reports clean and exits successfully", () =>
    Effect.gen(function* () {
      const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const before = snapshotWorkspaceContent(workspace.root);

      const exit = yield* lint(workspace.root).pipe(Effect.provide(workspace.layer), Effect.exit);

      expect(Exit.isSuccess(exit)).toBe(true);

      const entry = workspace.rendererState.results.at(-1);
      expect(entry?.ok).toBe(true);
      const document = yield* decodeDocument(entry?.data);
      expect(document.result.summary.exitCategory).toBe("clean");
      expect(document.result.findings).toEqual([]);

      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
    }),
  );
});

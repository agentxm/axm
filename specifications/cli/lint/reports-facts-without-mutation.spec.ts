import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  LintResultDocumentSchema,
  handleInstall,
  handleLint,
} from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { writeLocalSkillPackage } from "../../support/install-harness.js";
import { installBundledAxmSkill, makeLintSpecWorkspace } from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-facts-without-mutation",
  title: "Lint reports invariant violations without changing any workspace state",
  class: "functional",
  intents: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
  cases: {
    "broken-workspace-reports-read-only":
      "a broken invariant is reported with a failing exit while every byte of workspace state survives",
    "valid-workspace-reports-clean": "a valid workspace reports clean and exits successfully",
  },
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
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        // Break an invariant: remove the realized agent projection while the
        // desired state, lock state, and canonical content still require it.
        fs.rmSync(path.join(workspace.root, ".claude", "skills", "code-review"), {
          recursive: true,
        });

        const settingsBefore = workspace.readFile("axm.json");
        const lockBefore = workspace.readLockfileText();
        const treeBefore = workspace.snapshotTree("");

        const exit = yield* lint(workspace.root).pipe(Effect.provide(workspace.layer), Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);

        const entry = workspace.rendererState.results.at(-1);
        expect(entry?.ok).toBe(false);
        const document = yield* decodeDocument(entry?.data);
        expect(document.result.summary.exitCategory).toBe("errors");
        expect(document.result.summary.errors).toBeGreaterThanOrEqual(1);
        expect(document.result.findings.length).toBeGreaterThanOrEqual(1);

        expect(workspace.readFile("axm.json")).toBe(settingsBefore);
        expect(workspace.readLockfileText()).toBe(lockBefore);
        expect(workspace.snapshotTree("")).toEqual(treeBefore);
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
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const treeBefore = workspace.snapshotTree("");

      const exit = yield* lint(workspace.root).pipe(Effect.provide(workspace.layer), Effect.exit);

      expect(Exit.isSuccess(exit)).toBe(true);

      const entry = workspace.rendererState.results.at(-1);
      expect(entry?.ok).toBe(true);
      const document = yield* decodeDocument(entry?.data);
      expect(document.result.summary.exitCategory).toBe("clean");
      expect(document.result.findings).toEqual([]);

      expect(workspace.snapshotTree("")).toEqual(treeBefore);
    }),
  );
});

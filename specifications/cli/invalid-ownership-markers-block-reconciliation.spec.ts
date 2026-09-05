import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleLint, handleSync, LintResultDocumentSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/invalid-ownership-markers-block-reconciliation",
  title: "Invalid ownership markers block reconciliation without altering the document",
  statement:
    "When a generated document carries an ownership marker AXM cannot validate, lint shall report the invalid ownership and reconciliation shall report a blocked outcome, and neither shall alter the document.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/projection-currency-follows-state-authority"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const writeAuthoredRule = (workspaceRoot: string, body: string): void => {
  const packageRoot = path.join(workspaceRoot, "rules", "review");
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "rule.json"),
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/rule.schema.json",
      owner: "@acme",
      type: "rule",
      name: "review",
      version: "1.0.0",
      description: "Review changes.",
    })}\n`,
  );
  fs.writeFileSync(path.join(packageRoot, "src", "RULE.md"), body);
};

const decodeLintDocument = Schema.decodeUnknownEffect(LintResultDocumentSchema);

describe("Invalid ownership markers", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports invalid ownership and blocks reconciliation without changing bytes", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: [],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          rules: { review: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "Required guidance.\n");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const invalid = workspace
        .readFile("AGENTS.md")
        .replace("axm:start v=1 region=rules", "axm:start v=2 region=rules")
        .replace("axm:end v=1 region=rules", "axm:end v=2 region=rules");
      fs.writeFileSync(path.join(workspace.root, "AGENTS.md"), invalid);

      const lintExit = yield* handleLint({
        pathArg: Option.some(workspace.root),
        scope: "project",
        strict: false,
        details: false,
        fix: false,
        input: { view: "workspace" },
      }).pipe(Effect.provide(workspace.layer), Effect.exit);
      expect(Exit.isFailure(lintExit)).toBe(true);
      const lintDocument = yield* decodeLintDocument(workspace.rendererState.results.at(-1)?.data);
      expect(lintDocument.result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "workspace/projection-ownership-valid" }),
        ]),
      );
      expect(workspace.readFile("AGENTS.md")).toBe(invalid);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(workspace.rendererState.results.at(-1)).toMatchObject({
        ok: false,
        data: { result: { outcome: "blocked" } },
      });
      expect(workspace.readFile("AGENTS.md")).toBe(invalid);
    }),
  );
});

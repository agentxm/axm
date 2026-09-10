import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { lintKnowledge } from "./lint-knowledge.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/lint/reports-validation-without-mutation",
  title: "Knowledge lint reports source findings without changing content",
  statement:
    "When validating installed or explicitly selected authored Knowledge, AXM shall report source-located findings without changing workspace content, returning failure for errors and success for warnings alone.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/knowledge/json-output.test.ts",
    "apps/cli-e2e/src/knowledge.e2e.test.ts",
    "cli/lint/catalog-is-complete",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Read-only Knowledge validation", () => {
  for (const selection of ["installed", "authored"] as const)
    it.effect(`reports and clears ${selection} validation errors`, () => {
      const invalid = "---\ntype: [broken\n---\n# Broken\n";
      const workspace = makeKnowledgeFixtureWorkspace({
        bundles: [
          {
            name: "platform",
            documents: {
              "index.md": '---\nokf_version: "0.2"\n---\n# Platform\n\n[Broken](broken.md)\n',
              "broken.md": invalid,
            },
          },
        ],
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            const settings = workspace.readSettings();
            const lockfile = workspace.readLockfileText();
            const validate = () =>
              selection === "installed"
                ? lintKnowledge({ bundle: "platform" })
                : lintKnowledge({ packagePath: "knowledge/platform" });

            const reported = yield* validate();
            expect(reported.document.valid).toBe(false);
            expect(reported.errorCount).toBeGreaterThan(0);
            const finding = reported.document.diagnostics.find(
              (item) => item.code === "invalid-frontmatter",
            );
            expect(finding).toMatchObject({
              bundle: "platform",
              severity: "error",
              relativePath: "broken.md",
            });
            expect(finding?.line).toBeGreaterThan(0);
            expect(finding?.column).toBeGreaterThan(0);
            expect(workspace.readFile("knowledge/platform/src/broken.md")).toBe(invalid);
            expect(workspace.readSettings()).toEqual(settings);
            expect(workspace.readLockfileText()).toBe(lockfile);

            workspace.writeDocument("broken.md", knowledgeDocument("# Corrected\n"));
            const cleared = yield* validate();
            expect(cleared.document).toEqual({ valid: true, diagnostics: [] });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    });

  it.effect("keeps missing resource warnings distinct from escaping resource errors", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        {
          name: "platform",
          documents: {
            "resource.md": knowledgeDocument("# Resource\n", { resource: "./missing.txt" }),
          },
        },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const warned = yield* lintKnowledge({ bundle: "platform" });
          expect(warned.document).toMatchObject({
            valid: true,
            diagnostics: expect.arrayContaining([
              expect.objectContaining({
                code: "unresolved-resource",
                severity: "warning",
                relativePath: "resource.md",
              }),
            ]),
          });
          workspace.writeDocument(
            "resource.md",
            knowledgeDocument("# Resource\n", { resource: "../outside.txt" }),
          );
          const refused = yield* lintKnowledge({ bundle: "platform" });
          expect(refused.document).toMatchObject({
            valid: false,
            diagnostics: expect.arrayContaining([
              expect.objectContaining({ code: "escaping-resource", severity: "error" }),
            ]),
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import {
  handleKnowledgeConceptStatus,
  KnowledgeConceptStatusOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
  withChangingKnowledgeReads,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/status/reports-current-corpus-health",
  title: "Status distinguishes a ready corpus from unstable and unavailable sources",
  statement:
    "When reporting Knowledge discovery status, AXM shall distinguish a ready captured corpus, source bytes that keep changing, and stable capture failures, with current counts and identity for readiness or an actionable diagnostic for failure.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/knowledge/concepts/status.ts",
    "packages/cli/src/root/knowledge/concepts/schemas.ts",
    "packages/cli/src/root/knowledge/json-output.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "When source capture succeeds but OKF inspection contains error findings, should discovery report a ready but unhealthy corpus or refuse that corpus as unavailable?",
  ],
});

describe("Knowledge discovery health", () => {
  it.effect("reports ready source identity and changes identity after an edit", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        const read = () =>
          Schema.decodeUnknownSync(KnowledgeConceptStatusOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
        yield* handleKnowledgeConceptStatus();
        const first = read();
        expect(first).toMatchObject({
          readiness: "ready",
          bundleCount: 1,
          conceptCount: 2,
          health: { status: "healthy", diagnostics: [] },
        });
        expect(first.corpusFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
        workspace.writeDocument("session.md", knowledgeDocument("# Session\n\nRevised.\n"));
        yield* handleKnowledgeConceptStatus();
        expect(read().corpusFingerprint).not.toBe(first.corpusFingerprint);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
  for (const condition of ["changing", "invalid-manifest"] as const)
    it.effect(condition, () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
        ],
      });
      if (condition === "invalid-manifest")
        fs.writeFileSync(
          path.join(workspace.root, "knowledge/platform/knowledge.json"),
          "{ invalid",
        );
      return workspace.provide(
        Effect.gen(function* () {
          yield* condition === "changing"
            ? withChangingKnowledgeReads(handleKnowledgeConceptStatus())
            : handleKnowledgeConceptStatus();
          const status = Schema.decodeUnknownSync(KnowledgeConceptStatusOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(status.readiness).toBe(condition === "changing" ? "changing" : "unavailable");
          expect(status.health.status).toBe("unhealthy");
          expect(status.health.diagnostics.join(" ")).toMatch(
            condition === "changing" ? /chang/iu : /platform.*manifest/iu,
          );
          expect(status.corpusFingerprint).toBeUndefined();
          expect(status.bundleCount).toBe(0);
          expect(status.conceptCount).toBe(0);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});

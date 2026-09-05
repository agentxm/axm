import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import {
  handleKnowledgeConceptGet,
  KnowledgeConceptGetOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/get/rejects-changed-revision",
  title: "Conditional retrieval detects source changes",
  statement:
    "When a caller supplies a previously observed content revision for Knowledge retrieval, AXM shall return the concept only if its current source revision matches and otherwise report a revision conflict with the current revision.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Conditional retrieval", () => {
  it.effect("accepts the observed revision and rejects it after source bytes change", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "platform",
          documents: { "session.md": knowledgeDocument("# Session\n\nOriginal.\n") },
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        const read = () =>
          Schema.decodeUnknownSync(KnowledgeConceptGetOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
        yield* handleKnowledgeConceptGet("@acme/knowledge/platform#session");
        const revision = read().concept?.ref.contentRevision;
        if (revision === undefined) throw new Error("Expected a content revision");
        yield* handleKnowledgeConceptGet("@acme/knowledge/platform#session", {
          ifRevision: revision,
        });
        expect(read().outcome).toBe("found");
        workspace.writeDocument("session.md", knowledgeDocument("# Session\n\nRevised.\n"));
        const exit = yield* Effect.exit(
          handleKnowledgeConceptGet("@acme/knowledge/platform#session", { ifRevision: revision }),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        const failure = read();
        expect(failure).toMatchObject({
          outcome: "failed",
          reason: "revision-changed",
          expectedRevision: revision,
        });
        expect(failure.concept).toBeUndefined();
        yield* handleKnowledgeConceptGet("@acme/knowledge/platform#session");
        const fresh = read();
        expect(fresh.outcome).toBe("found");
        const currentRevision = fresh.concept?.ref.contentRevision;
        if (currentRevision === undefined) throw new Error("Expected the revised content revision");
        expect(currentRevision).not.toBe(revision);
        expect(failure.currentRevision).toBe(currentRevision);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});

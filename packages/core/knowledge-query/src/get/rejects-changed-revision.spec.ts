import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/get/rejects-changed-revision",
  title: "Conditional retrieval detects source changes",
  statement:
    "When a caller supplies a previously observed content revision for Knowledge retrieval, AXM shall return the concept only if its current source revision matches and otherwise report a revision conflict with the current revision.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/help/topics/knowledge.md", "apps/cli-e2e/src/knowledge.e2e.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Conditional retrieval", () => {
  it.effect("accepts the observed revision and rejects it after source bytes change", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        {
          name: "platform",
          documents: { "session.md": knowledgeDocument("# Session\n\nOriginal.\n") },
        },
      ],
    });
    const reference = "@acme/knowledge/platform#session";
    return workspace
      .provide(
        Effect.gen(function* () {
          const initial = yield* KnowledgeDiscovery.get({ reference });
          if (initial.outcome !== "ready") throw new Error("Expected the concept");
          const revision = initial.document.concept?.ref.contentRevision;
          if (revision === undefined) throw new Error("Expected a content revision");

          const unchanged = yield* KnowledgeDiscovery.get({ reference, ifRevision: revision });
          expect(unchanged.outcome).toBe("ready");

          workspace.writeDocument("session.md", knowledgeDocument("# Session\n\nRevised.\n"));
          const conflicted = yield* KnowledgeDiscovery.get({ reference, ifRevision: revision });
          if (conflicted.outcome !== "revision-changed") {
            throw new Error("Expected a revision conflict");
          }
          expect(conflicted.document).toMatchObject({
            outcome: "failed",
            reason: "revision-changed",
            expectedRevision: revision,
          });
          expect(conflicted.document.concept).toBeUndefined();

          const fresh = yield* KnowledgeDiscovery.get({ reference });
          if (fresh.outcome !== "ready") throw new Error("Expected the revised concept");
          const currentRevision = fresh.document.concept?.ref.contentRevision;
          expect(currentRevision).not.toBe(revision);
          expect(conflicted.document.currentRevision).toBe(currentRevision);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

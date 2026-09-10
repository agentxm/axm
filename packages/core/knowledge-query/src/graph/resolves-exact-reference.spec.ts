import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { resolveKnowledgeConcept } from "../knowledge-graph.js";
import {
  captureFixtureSnapshot,
  knowledgeDocument,
  makeKnowledgeFixtureWorkspace,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/resolve/resolves-exact-reference",
  title: "Exact concept references resolve to installed identity",
  statement:
    "When given a compact or canonical HTTPS reference to an installed Knowledge concept, AXM shall resolve the exact concept to its installed bundle version and source revision.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/help/topics/knowledge.md",
    "packages/core/knowledge-query/src/knowledge-graph.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Exact reference resolution", () => {
  for (const reference of [
    "@acme/knowledge/platform#auth/session",
    "https://agentxm.ai/@acme/knowledge/platform/concepts/auth/session",
  ])
    it.effect(reference, () => {
      const workspace = makeKnowledgeFixtureWorkspace({
        bundles: [
          { name: "platform", documents: { "auth/session.md": knowledgeDocument("# Session\n") } },
        ],
      });
      return Effect.gen(function* () {
        const snapshot = yield* captureFixtureSnapshot(workspace);
        const resolved = resolveKnowledgeConcept(snapshot, reference);
        expect(resolved).toMatchObject({
          outcome: "resolved",
          candidate: {
            reason: "exact-reference",
            ref: {
              bundle: "@acme/knowledge/platform",
              conceptId: "auth/session",
              bundleVersion: "1.0.0",
            },
          },
        });
        expect(
          resolved.outcome === "resolved" ? resolved.candidate.ref.contentRevision : undefined,
        ).toMatch(/^sha256:[0-9a-f]{64}$/u);
      }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    });
});

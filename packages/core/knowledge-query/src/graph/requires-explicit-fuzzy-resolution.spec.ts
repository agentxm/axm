import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "../knowledge-capabilities.js";
import { resolveKnowledgeConcept } from "../knowledge-graph.js";
import {
  captureFixtureSnapshot,
  knowledgeDocument,
  makeKnowledgeFixtureWorkspace,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/resolve/requires-explicit-fuzzy-resolution",
  title: "Fuzzy resolution requires opt-in and exposes ambiguity",
  statement:
    "When resolving text that is not an exact Knowledge reference, AXM shall require explicit fuzzy resolution and return at most ten deterministic candidates without choosing among ambiguous matches.",
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

const maximumCandidates = KNOWLEDGE_DISCOVERY_CAPABILITIES.limits.maximumFuzzyCandidates;

describe("Explicit fuzzy resolution", () => {
  it.effect("rejects implicit matching and reports bounded ambiguity reproducibly", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        {
          name: "platform",
          documents: Object.fromEntries(
            Array.from({ length: 12 }, (_, index) => [
              `session-${String(index).padStart(2, "0")}.md`,
              knowledgeDocument("# Session\n"),
            ]),
          ),
        },
      ],
    });
    return Effect.gen(function* () {
      const snapshot = yield* captureFixtureSnapshot(workspace);
      expect(resolveKnowledgeConcept(snapshot, "Session")).toMatchObject({
        outcome: "not-found",
        candidates: [],
      });
      const first = resolveKnowledgeConcept(snapshot, "Session", maximumCandidates, true);
      expect(first.outcome).toBe("ambiguous");
      expect(first.outcome === "ambiguous" ? first.candidates : []).toHaveLength(maximumCandidates);
      expect("candidate" in first).toBe(false);
      expect(resolveKnowledgeConcept(snapshot, "Session", maximumCandidates, true)).toEqual(first);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("resolves a unique concept ID when fuzzy matching is requested", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Unique session\n") } },
      ],
    });
    return Effect.gen(function* () {
      const snapshot = yield* captureFixtureSnapshot(workspace);
      expect(resolveKnowledgeConcept(snapshot, "session", maximumCandidates, true)).toMatchObject({
        outcome: "resolved",
        candidate: { ref: { conceptId: "session" } },
      });
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

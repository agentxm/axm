import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import {
  handleKnowledgeConceptResolve,
  KnowledgeConceptResolveOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

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
    "packages/cli/help/topics/knowledge.md",
    "packages/knowledge-query/src/knowledge-graph.internal.test.ts",
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
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          { name: "platform", documents: { "auth/session.md": knowledgeDocument("# Session\n") } },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          yield* handleKnowledgeConceptResolve(reference);
          const output = Schema.decodeUnknownSync(KnowledgeConceptResolveOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(output).toMatchObject({
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
          expect(output.candidate?.ref.contentRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});

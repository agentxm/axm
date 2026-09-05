import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleKnowledgeConceptSearch } from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/search/matches-lexical-query",
  title: "Search matches the requested lexical expression",
  statement:
    "When searching installed Knowledge, AXM shall match all normalized whole-token terms across searchable fields, contiguous phrases within one field, and exact literals within one field.",
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

describe("Lexical Knowledge search", () => {
  const cases = [
    { input: "AUTHENTICATION café", ids: ["session"] },
    { input: "sessionFlow", ids: ["session"] },
    { input: '"session flow"', ids: ["session"] },
    { input: 'literal:"session-flow"', ids: ["session"] },
    { input: '"authentication session"', ids: [] },
    { input: "auth", ids: [] },
    { input: "sessions", ids: [] },
    { input: 'literal:"session flow"', ids: [] },
  ];
  for (const example of cases)
    it.effect(example.input, () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          {
            name: "platform",
            documents: {
              "session.md": knowledgeDocument("# Session-flow\n\nCafe\u0301 guidance.\n", {
                description: "Authentication",
              }),
              "other.md": knowledgeDocument("# Unrelated\n\nAuthorization sessionless wording.\n"),
            },
          },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          yield* handleKnowledgeConceptSearch(example.input, "project");
          expect(workspace.readQueryPage().items.map((item) => item.ref.conceptId)).toEqual(
            example.ids,
          );
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});

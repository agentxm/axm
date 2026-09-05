import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleKnowledgeConceptQuery } from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/query/enumerates-selected-document-kinds",
  title: "Enumeration selects ordinary current concepts by default",
  statement:
    "When a Knowledge query has no text expression, AXM shall enumerate nondeprecated ordinary concepts in stable bundle and concept order unless the caller explicitly selects another document kind or lifecycle status.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/knowledge-query/src/knowledge-index.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge enumeration", () => {
  it.effect("keeps reserved and deprecated documents behind explicit selectors", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "platform",
          documents: {
            "beta.md": knowledgeDocument("# Beta\n"),
            "alpha.md": knowledgeDocument("# Alpha\n"),
            "retired.md": knowledgeDocument("# Retired\n", { status: "deprecated" }),
            "log.md": "# Log\n",
          },
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptQuery("project", knowledgeQueryOptions);
        expect(workspace.readQueryPage().items.map((item) => item.ref.conceptId)).toEqual([
          "alpha",
          "beta",
        ]);
        for (const kind of ["index", "log"] as const) {
          yield* handleKnowledgeConceptQuery("project", { ...knowledgeQueryOptions, kind });
          expect(
            workspace.readQueryPage().items.map((item) => [item.ref.conceptId, item.kind]),
          ).toEqual([[kind, kind]]);
        }
        yield* handleKnowledgeConceptQuery("project", {
          ...knowledgeQueryOptions,
          status: "deprecated",
        });
        expect(workspace.readQueryPage().items.map((item) => item.ref.conceptId)).toEqual([
          "retired",
        ]);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });

  it.effect("orders across bundles and concepts independently of creation order", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "zeta",
          documents: {
            "beta.md": knowledgeDocument("# Zeta beta\n"),
            "alpha.md": knowledgeDocument("# Zeta alpha\n"),
          },
        },
        {
          name: "alpha",
          documents: {
            "beta.md": knowledgeDocument("# Alpha beta\n"),
            "alpha.md": knowledgeDocument("# Alpha alpha\n"),
          },
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptQuery("project", knowledgeQueryOptions);
        expect(
          workspace.readQueryPage().items.map((item) => [item.ref.bundle, item.ref.conceptId]),
        ).toEqual([
          ["@acme/knowledge/alpha", "alpha"],
          ["@acme/knowledge/alpha", "beta"],
          ["@acme/knowledge/zeta", "alpha"],
          ["@acme/knowledge/zeta", "beta"],
        ]);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});

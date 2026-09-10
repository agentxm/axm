import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

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
    "apps/cli/help/topics/knowledge.md",
    "packages/core/knowledge-query/src/knowledge-index.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge enumeration", () => {
  it.effect("keeps reserved and deprecated documents behind explicit selectors", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
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
    return workspace
      .provide(
        Effect.gen(function* () {
          const run = Effect.fn("spec.enumerate")(function* (
            request: Parameters<typeof KnowledgeDiscovery.query>[0],
          ) {
            const result = yield* KnowledgeDiscovery.query(request);
            if (result.outcome !== "ready") throw new Error("Expected a page");
            return result.page;
          });
          expect(
            (yield* run({ scope: "project" })).items.map((item) => item.ref.conceptId),
          ).toEqual(["alpha", "beta"]);
          for (const kind of ["index", "log"] as const) {
            expect(
              (yield* run({ scope: "project", kind })).items.map((item) => [
                item.ref.conceptId,
                item.kind,
              ]),
            ).toEqual([[kind, kind]]);
          }
          expect(
            (yield* run({ scope: "project", status: "deprecated" })).items.map(
              (item) => item.ref.conceptId,
            ),
          ).toEqual(["retired"]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("orders across bundles and concepts independently of creation order", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
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
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* KnowledgeDiscovery.query({ scope: "project" });
          if (result.outcome !== "ready") throw new Error("Expected a page");
          expect(result.page.items.map((item) => [item.ref.bundle, item.ref.conceptId])).toEqual([
            ["@acme/knowledge/alpha", "alpha"],
            ["@acme/knowledge/alpha", "beta"],
            ["@acme/knowledge/zeta", "alpha"],
            ["@acme/knowledge/zeta", "beta"],
          ]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

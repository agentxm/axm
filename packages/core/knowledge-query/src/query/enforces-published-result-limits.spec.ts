import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "../knowledge-capabilities.js";
import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/enforces-published-result-limits",
  title: "Query and search accept the published result limits",
  statement:
    "When a Knowledge query or search selects a result limit, AXM shall accept only whole-number limits from 1 through 100 and return no more than that many concepts on a page.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/help/topics/knowledge.md",
    "packages/core/knowledge-query/src/query/request.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const maximum = KNOWLEDGE_DISCOVERY_CAPABILITIES.limits.maximumPageSize;

const operations = [
  {
    name: "query",
    run: (resultLimit: number) =>
      KnowledgeDiscovery.query({ scope: "project", expression: "session", resultLimit }),
  },
  {
    name: "search",
    run: (resultLimit: number) =>
      KnowledgeDiscovery.search({ scope: "project", expression: "session", resultLimit }),
  },
];

describe("Published concept result limits", () => {
  for (const operation of operations) {
    it.effect(`${operation.name} enforces the advertised range and page limit`, () => {
      const workspace = makeKnowledgeFixtureWorkspace({
        bundles: [
          {
            name: "platform",
            documents: Object.fromEntries(
              Array.from({ length: 101 }, (_, index) => [
                `session-${index}.md`,
                knowledgeDocument("# Session\n"),
              ]),
            ),
          },
        ],
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            expect(maximum).toBe(100);
            for (const resultLimit of [1, maximum]) {
              const page = yield* operation.run(resultLimit);
              if (page.outcome !== "ready") throw new Error("Expected a page");
              expect(page.page.count).toBe(101);
              expect(page.page.items).toHaveLength(resultLimit);
              expect(page.page.hasMore).toBe(true);
            }
            for (const resultLimit of [0, maximum + 1, 1.5]) {
              const result = yield* Effect.result(operation.run(resultLimit));
              expect(Result.isFailure(result) && result.failure._tag).toBe(
                "KnowledgeRequestInvalid",
              );
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    });
  }
});

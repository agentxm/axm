import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";

import { reportKnowledgeDiscoveryCapabilities } from "../corpus/corpus-capabilities.js";
import { KnowledgeDiscoveryCapabilitiesSchema } from "../knowledge-capabilities.js";
import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/capabilities/publishes-discovery-capabilities",
  title: "Discovery capabilities describe the supported query contract",
  statement:
    "When reporting Knowledge discovery capabilities, AXM shall identify its query grammar, supported operations and fields, output contract, cursor validity, and output limits consistently with the discovery commands.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-features/src/knowledge-query/knowledge-capabilities.ts",
    "apps/cli/help/topics/knowledge.md",
  ],
  supersedes: ["cli/knowledge/concepts/status/publishes-discovery-capabilities"],
  assumptions: [],
  openQuestions: [],
});

describe("Discoverable query contract", () => {
  it.effect("publishes capabilities and applies the advertised default query bounds", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        {
          name: "platform",
          documents: Object.fromEntries(
            Array.from({ length: 26 }, (_, index) => [
              `concept-${String(index).padStart(2, "0")}.md`,
              knowledgeDocument("# Concept\n"),
            ]),
          ),
        },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const captured = yield* reportKnowledgeDiscoveryCapabilities();
          if (captured.outcome !== "ready") throw new Error("Expected a captured corpus");
          const capabilities = Schema.decodeUnknownSync(KnowledgeDiscoveryCapabilitiesSchema)(
            captured.document.capabilities,
          );
          expect(capabilities).toMatchObject({
            contract: "knowledge-discovery-capabilities-v1",
            queryContract: "knowledge-query-v1",
            operations: ["resolve", "query", "get", "related", "capabilities"],
            strategies: ["lexical"],
            operators: ["term", "phrase", "literal", "equals", "not-equals", "contains"],
            extensionProperties: {
              addressing: "rfc6901-json-pointer",
              source: "preserved-frontmatter",
            },
            output: {
              envelope: "result-envelope-v1",
              resultLevel: "concept",
              paginationKeys: ["items", "count", "hasMore", "cursor"],
            },
          });
          expect(capabilities.searchableFields.length).toBeGreaterThan(0);
          expect(capabilities.metadataFilterFields.length).toBeGreaterThan(0);
          expect(capabilities.lifecycleFilterFields.length).toBeGreaterThan(0);
          expect(capabilities.cursor.mechanism).toBe("stateless-opaque");
          expect(capabilities.cursor.binds).toContain("corpus-fingerprint");

          // What the report advertises is what the query API applies.
          const result = yield* KnowledgeDiscovery.query({ scope: "project" });
          if (result.outcome !== "ready") throw new Error("Expected a page");
          expect(result.page.items).toHaveLength(capabilities.limits.defaultPageSize);
          expect(result.page.count).toBe(26);
          expect(result.page.hasMore).toBe(true);
          expect(result.page.query).toMatchObject({
            resultLimit: capabilities.limits.defaultPageSize,
            passageLimit: capabilities.limits.defaultPassagesPerResult,
            passageLength: capabilities.limits.defaultPassageLength,
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

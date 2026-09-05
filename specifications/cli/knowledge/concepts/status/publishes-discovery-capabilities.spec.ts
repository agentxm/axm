import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import {
  handleKnowledgeConceptStatus,
  handleKnowledgeConceptQuery,
  KnowledgeConceptStatusOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/status/publishes-discovery-capabilities",
  title: "Discovery status describes the supported query contract",
  statement:
    "When reporting Knowledge discovery capabilities, AXM shall identify its query grammar, supported operations and fields, output contract, cursor validity, and output limits consistently with the discovery commands.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation"],
  methods: ["example"],
  derivedFrom: [
    "packages/knowledge-query/src/knowledge-capabilities.ts",
    "packages/cli/help/topics/knowledge.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Discoverable query contract", () => {
  it.effect("publishes capabilities and applies the advertised default query bounds", () => {
    const workspace = makeKnowledgeSpecWorkspace({
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
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptStatus();
        const { capabilities } = Schema.decodeUnknownSync(KnowledgeConceptStatusOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(capabilities).toMatchObject({
          version: "axm-knowledge-discovery-capabilities-v1",
          queryContractVersion: "axm-knowledge-query-v1",
          operations: ["resolve", "search", "query", "get", "related", "status"],
          strategies: ["lexical"],
          operators: ["term", "phrase", "literal", "equals", "not-equals", "contains"],
          extensionProperties: {
            addressing: "rfc6901-json-pointer",
            source: "preserved-frontmatter",
          },
          limits: {
            defaultPageSize: 25,
            maximumPageSize: 100,
            defaultPassagesPerResult: 3,
            maximumPassagesPerResult: 10,
            defaultPassageLength: 500,
            maximumPassageLength: 2000,
            maximumTraversalDepth: 3,
            maximumFuzzyCandidates: 10,
          },
          cursor: { maximumAgeSeconds: 86400 },
          output: {
            envelope: "axm.machine-output/result-envelope-v1",
            resultLevel: "concept",
            paginationKeys: ["items", "count", "hasMore", "cursor"],
          },
        });
        yield* handleKnowledgeConceptQuery("project", knowledgeQueryOptions);
        const page = workspace.readQueryPage();
        expect(page.items).toHaveLength(capabilities.limits.defaultPageSize);
        expect(page.count).toBe(26);
        expect(page.hasMore).toBe(true);
        expect(page.query).toMatchObject({
          resultLimit: capabilities.limits.defaultPageSize,
          passageLimit: capabilities.limits.defaultPassagesPerResult,
          passageLength: capabilities.limits.defaultPassageLength,
        });
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});

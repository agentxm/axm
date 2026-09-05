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
  requirement: "cli/knowledge/concepts/query/combines-typed-filters",
  title: "Query filters jointly select matching concepts",
  statement:
    "When a Knowledge query supplies text, field, property, metadata, lifecycle, tag, or bundle filters, AXM shall return only concepts satisfying every supplied filter with the selected operator.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/knowledge-query/src/knowledge-index.internal.test.ts",
    "packages/cli/src/root/knowledge/concepts/query.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Conjunctive typed filters", () => {
  it.effect("combines lexical fields and typed metadata with escaped property paths", () => {
    const matchingMetadata = {
      tags: ["identity", "access"],
      status: "stable",
      producer: { "team/name": "AgentXM", "~tier": "core" },
    };
    const matchingBody = "# Session flow\n\nAuthentication details.\n";
    const exclusions = [
      { filter: "text", concept: "text-near" },
      { filter: "field", concept: "field-near" },
      { filter: "property-team", concept: "other" },
      { filter: "property-tier", concept: "tier-near" },
      { filter: "metadata", concept: "metadata-near" },
      { filter: "lifecycle", concept: "lifecycle-near" },
      { filter: "identity-tag", concept: "identity-tag-near" },
      { filter: "access-tag", concept: "access-tag-near" },
      { filter: "bundle", concept: "bundle-near" },
    ] as const;
    const queryOptions = (omitted?: (typeof exclusions)[number]["filter"]) => ({
      ...knowledgeQueryOptions,
      ...(omitted === "text" ? {} : { expression: "authentication" }),
      fields: omitted === "field" ? [] : ["title=session"],
      properties: [
        ...(omitted === "property-team" ? [] : ["/producer/team~1name~=agent"]),
        ...(omitted === "property-tier" ? [] : ["/producer/~0tier!=edge"]),
      ],
      metadata: omitted === "metadata" ? [] : ["type=guide"],
      lifecycle: omitted === "lifecycle" ? [] : ["status!=draft"],
      tags: [
        ...(omitted === "identity-tag" ? [] : ["identity"]),
        ...(omitted === "access-tag" ? [] : ["access"]),
      ],
      ...(omitted === "bundle" ? {} : { bundle: "@acme/knowledge/platform" }),
    });
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "platform",
          documents: {
            "session.md": knowledgeDocument(matchingBody, matchingMetadata),
            "text-near.md": knowledgeDocument(
              "# Session flow\n\nAuthorization details.\n",
              matchingMetadata,
            ),
            "field-near.md": knowledgeDocument(
              "# Connection flow\n\nAuthentication details.\n",
              matchingMetadata,
            ),
            "other.md": knowledgeDocument(matchingBody, {
              ...matchingMetadata,
              producer: { "team/name": "Other", "~tier": "core" },
            }),
            "tier-near.md": knowledgeDocument(matchingBody, {
              ...matchingMetadata,
              producer: { "team/name": "AgentXM", "~tier": "edge" },
            }),
            "metadata-near.md": knowledgeDocument(matchingBody, {
              ...matchingMetadata,
              type: "reference",
            }),
            "lifecycle-near.md": knowledgeDocument(matchingBody, {
              ...matchingMetadata,
              status: "draft",
            }),
            "identity-tag-near.md": knowledgeDocument(matchingBody, {
              ...matchingMetadata,
              tags: ["access"],
            }),
            "access-tag-near.md": knowledgeDocument(matchingBody, {
              ...matchingMetadata,
              tags: ["identity"],
            }),
          },
        },
        {
          name: "other-bundle",
          documents: { "bundle-near.md": knowledgeDocument(matchingBody, matchingMetadata) },
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptQuery("project", queryOptions());
        expect(workspace.readQueryPage().items.map((item) => item.ref.conceptId)).toEqual([
          "session",
        ]);
        // Each near-match becomes visible when, and only when, its one
        // excluding filter is removed; no other predicate can mask that filter.
        for (const exclusion of exclusions) {
          yield* handleKnowledgeConceptQuery("project", queryOptions(exclusion.filter));
          expect(
            workspace
              .readQueryPage()
              .items.map((item) => item.ref.conceptId)
              .sort(),
          ).toEqual(["session", exclusion.concept].sort());
        }
        yield* handleKnowledgeConceptQuery("project", {
          ...knowledgeQueryOptions,
          properties: ["/producer/team~1name=other"],
        });
        expect(workspace.readQueryPage().items.map((item) => item.ref.conceptId)).toEqual([
          "other",
        ]);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});

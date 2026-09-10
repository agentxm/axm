import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/reports-unavailable-exact-references",
  title: "Exact retrieval does not substitute another concept",
  statement:
    "When an exact Knowledge reference is absent from the selected corpus, AXM shall report not found without substituting a similarly named concept.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/knowledge/concepts/get.ts",
    "apps/cli/src/root/knowledge/concepts/resolve.ts",
    "apps/cli/src/root/knowledge/concepts/related.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const reference = "@acme/knowledge/platform#sessions";

const withCorpus = () =>
  makeKnowledgeFixtureWorkspace({
    bundles: [{ name: "platform", documents: { "session.md": knowledgeDocument("# Sessions\n") } }],
  });

describe("Missing exact concept", () => {
  it.effect("get", () => {
    const workspace = withCorpus();
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(KnowledgeDiscovery.get({ reference }));
          expect(Result.isFailure(result) && result.failure._tag).toBe("KnowledgeConceptNotFound");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("related", () => {
    const workspace = withCorpus();
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(KnowledgeDiscovery.related({ reference }));
          expect(Result.isFailure(result) && result.failure._tag).toBe("KnowledgeConceptNotFound");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("resolve", () => {
    const workspace = withCorpus();
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolved = yield* KnowledgeDiscovery.resolve({ input: reference, fuzzy: true });
          expect(resolved).toMatchObject({
            outcome: "not-found",
            document: { outcome: "not-found" },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

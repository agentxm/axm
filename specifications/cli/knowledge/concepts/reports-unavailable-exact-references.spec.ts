import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import {
  handleKnowledgeConceptGet,
  handleKnowledgeConceptResolve,
  handleKnowledgeConceptRelated,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
} from "../../../support/knowledge-harness.js";

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
    "packages/cli/src/root/knowledge/concepts/get.ts",
    "packages/cli/src/root/knowledge/concepts/resolve.ts",
    "packages/cli/src/root/knowledge/concepts/related.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Missing exact concept", () => {
  const commands = [
    { name: "get", run: () => handleKnowledgeConceptGet("@acme/knowledge/platform#sessions") },
    {
      name: "resolve",
      run: () => handleKnowledgeConceptResolve("@acme/knowledge/platform#sessions", true),
    },
    {
      name: "related",
      run: () => handleKnowledgeConceptRelated("@acme/knowledge/platform#sessions"),
    },
  ];
  for (const command of commands)
    it.effect(command.name, () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          { name: "platform", documents: { "session.md": knowledgeDocument("# Sessions\n") } },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(command.run());
          expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "not_found" });
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});

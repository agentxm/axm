import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Exit from "effect/Exit";
import {
  handleKnowledgeConceptGet,
  handleKnowledgeConceptSearch,
  handleKnowledgeConceptQuery,
  handleKnowledgeConceptResolve,
  handleKnowledgeConceptRelated,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
  withChangingKnowledgeReads,
} from "../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/refuses-changing-corpus",
  title: "Discovery refuses an unstable source view",
  statement:
    "When Knowledge source bytes continue changing during capture, AXM shall report a corpus-changing conflict instead of returning results from an inconsistent source view.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/knowledge-query/src/knowledge-capture.internal.test.ts",
    "packages/knowledge-query/src/knowledge-revision.internal.test.ts",
    "packages/cli/src/root/knowledge/concepts/failures.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Changing Knowledge source", () => {
  const commands = [
    { name: "get", run: () => handleKnowledgeConceptGet("@acme/knowledge/platform#session") },
    { name: "search", run: () => handleKnowledgeConceptSearch("session", "project") },
    { name: "query", run: () => handleKnowledgeConceptQuery("project", knowledgeQueryOptions) },
    {
      name: "resolve",
      run: () => handleKnowledgeConceptResolve("@acme/knowledge/platform#session"),
    },
    {
      name: "related",
      run: () => handleKnowledgeConceptRelated("@acme/knowledge/platform#session"),
    },
  ];
  for (const command of commands)
    it.effect(command.name, () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(withChangingKnowledgeReads(command.run()));
          expect(Exit.isFailure(exit)).toBe(true);
          expect(workspace.rendererState.results).toHaveLength(1);
          expect(workspace.rendererState.results[0]?.data).toEqual({
            outcome: "failed",
            reason: "corpus-changing",
          });
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});

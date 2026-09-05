import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  handleKnowledgeConceptResolve,
  KnowledgeConceptResolveOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/resolve/requires-explicit-fuzzy-resolution",
  title: "Fuzzy resolution requires opt-in and exposes ambiguity",
  statement:
    "When resolving text that is not an exact Knowledge reference, AXM shall require explicit fuzzy resolution and return at most ten deterministic candidates without choosing among ambiguous matches.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/knowledge-query/src/knowledge-graph.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Explicit fuzzy resolution", () => {
  it.effect("rejects implicit matching and reports bounded ambiguity reproducibly", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "platform",
          documents: Object.fromEntries(
            Array.from({ length: 12 }, (_, index) => [
              `session-${String(index).padStart(2, "0")}.md`,
              knowledgeDocument("# Session\n"),
            ]),
          ),
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        const implicit = yield* Effect.result(handleKnowledgeConceptResolve("Session"));
        expect(Result.isFailure(implicit) && implicit.failure).toMatchObject({ code: "not_found" });
        const exit = yield* Effect.exit(handleKnowledgeConceptResolve("Session", true));
        expect(Exit.isFailure(exit)).toBe(true);
        const read = () =>
          Schema.decodeUnknownSync(KnowledgeConceptResolveOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
        const first = read();
        expect(first).toMatchObject({ outcome: "ambiguous", reason: "ambiguous-reference" });
        expect(first.candidates).toHaveLength(10);
        expect(first.candidate).toBeUndefined();
        yield* Effect.exit(handleKnowledgeConceptResolve("Session", true));
        expect(read()).toEqual(first);
        const exactMissing = yield* Effect.result(
          handleKnowledgeConceptResolve("@acme/knowledge/platform#Session", true),
        );
        expect(Result.isFailure(exactMissing) && exactMissing.failure).toMatchObject({
          code: "not_found",
        });
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
  it.effect("resolves a unique concept ID when fuzzy matching is requested", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Unique session\n") } },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptResolve("session", true);
        expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
          outcome: "resolved",
          candidate: { ref: { conceptId: "session" } },
        });
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});

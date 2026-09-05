import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import {
  handleKnowledgeConceptGet,
  KnowledgeConceptGetOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/get/returns-source-backed-document",
  title: "Get preserves source content and revision identity",
  statement:
    "When retrieving an installed Knowledge concept, AXM shall return its complete frontmatter and body with source-backed bundle, content, and projection revision identity, including the exact source document when raw output is requested.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/cli-e2e/src/knowledge.e2e.test.ts",
    "packages/knowledge-query/src/knowledge-index.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Source-backed concept retrieval", () => {
  it.effect("preserves nested and unrecognized frontmatter through capture and retrieval", () => {
    const frontmatter = {
      title: "Sign in",
      description: "Identity guidance",
      tags: ["identity"],
      producer: { name: "AgentXM", flags: [true, 2, null] },
    };
    const body = "# Sign in\n\nUse the canonical account.\n";
    const raw = knowledgeDocument(body, frontmatter);
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [{ name: "platform", documents: { "auth/session.md": raw } }],
    });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptGet("@acme/knowledge/platform#auth/session", { raw: true });
        const output = Schema.decodeUnknownSync(KnowledgeConceptGetOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(output.outcome).toBe("found");
        expect(output.concept).toMatchObject({
          body,
          raw,
          relativePath: "auth/session.md",
          frontmatter,
          ref: {
            bundle: "@acme/knowledge/platform",
            conceptId: "auth/session",
            bundleVersion: "1.0.0",
          },
        });
        expect(output.concept?.ref.contentRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);
        expect(output.concept?.ref.bundleFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
        expect(output.concept?.projectionRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);
        yield* handleKnowledgeConceptGet("@acme/knowledge/platform#auth/session");
        const normal = Schema.decodeUnknownSync(KnowledgeConceptGetOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(normal.concept?.raw).toBeUndefined();
        expect(normal.concept?.ref).toEqual(output.concept?.ref);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});

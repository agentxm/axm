import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

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
    "apps/cli/help/topics/knowledge.md",
    "apps/cli-e2e/src/knowledge.e2e.test.ts",
    "packages/core/knowledge-query/src/knowledge-index.test.ts",
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
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [{ name: "platform", documents: { "auth/session.md": raw } }],
    });
    const reference = "@acme/knowledge/platform#auth/session";
    return workspace
      .provide(
        Effect.gen(function* () {
          const requested = yield* KnowledgeDiscovery.get({ reference, raw: true });
          if (requested.outcome !== "ready") throw new Error("Expected the concept");
          expect(requested.document.outcome).toBe("found");
          expect(requested.document.concept).toMatchObject({
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
          expect(requested.document.concept?.ref.contentRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);
          expect(requested.document.concept?.ref.bundleFingerprint).toMatch(
            /^sha256:[0-9a-f]{64}$/u,
          );
          expect(requested.document.concept?.projectionRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);

          const normal = yield* KnowledgeDiscovery.get({ reference });
          if (normal.outcome !== "ready") throw new Error("Expected the concept");
          expect(normal.document.concept?.raw).toBeUndefined();
          expect(normal.document.concept?.ref).toEqual(requested.document.concept?.ref);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

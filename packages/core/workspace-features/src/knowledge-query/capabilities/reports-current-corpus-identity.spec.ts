import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { defineSpecification } from "@agentxm/specification-metadata";

import { reportKnowledgeDiscoveryCapabilities } from "../corpus/corpus-capabilities.js";
import {
  knowledgeDocument,
  makeKnowledgeFixtureWorkspace,
  withChangingKnowledgeReads,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/capabilities/reports-current-corpus-identity",
  title: "Capabilities identify a captured corpus and refuse unavailable sources",
  statement:
    "When reporting Knowledge discovery capabilities, AXM shall return current counts and a fingerprint from a ready captured corpus without health or readiness fields, and shall refuse changing or unavailable source capture with the same actionable outcomes as the sibling discovery operations.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-features/src/knowledge-query/corpus/corpus-capabilities.ts",
    "apps/cli/src/root/knowledge/json-output.test.ts",
  ],
  supersedes: ["cli/knowledge/concepts/status/reports-current-corpus-health"],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge discovery capability capture", () => {
  it.effect("reports source identity and changes identity after an edit", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const first = yield* reportKnowledgeDiscoveryCapabilities();
          if (first.outcome !== "ready") throw new Error("Expected a captured corpus");
          expect(first.document).toMatchObject({ bundleCount: 1, conceptCount: 2 });
          expect(first.document.corpusFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
          expect(first.document).not.toHaveProperty("readiness");
          expect(first.document).not.toHaveProperty("health");
          workspace.writeDocument("session.md", knowledgeDocument("# Session\n\nRevised.\n"));
          const second = yield* reportKnowledgeDiscoveryCapabilities();
          if (second.outcome !== "ready") throw new Error("Expected a captured corpus");
          expect(second.document.corpusFingerprint).not.toBe(first.document.corpusFingerprint);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("refuses changing capture without a success document", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* withChangingKnowledgeReads(reportKnowledgeDiscoveryCapabilities());
          expect(result).toEqual({ outcome: "corpus-changing" });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("keeps an invalid manifest as a typed capture failure", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
      ],
    });
    fs.writeFileSync(
      nodePath.join(workspace.root, "knowledge/platform/knowledge.json"),
      "{ invalid",
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          const failure = yield* reportKnowledgeDiscoveryCapabilities().pipe(Effect.flip);
          expect(failure).toMatchObject({ _tag: "KnowledgeCorpusUnavailable" });
          if (failure._tag === "KnowledgeCorpusUnavailable")
            expect(failure.detail).toMatch(/platform.*manifest/iu);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

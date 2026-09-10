import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { defineSpecification } from "@agentxm/specification-metadata";

import { reportKnowledgeCorpusStatus } from "./corpus-status.js";
import {
  knowledgeDocument,
  makeKnowledgeFixtureWorkspace,
  withChangingKnowledgeReads,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/status/reports-current-corpus-health",
  title: "Status distinguishes a ready corpus from unstable and unavailable sources",
  statement:
    "When reporting Knowledge discovery status, AXM shall distinguish a ready captured corpus, source bytes that keep changing, and stable capture failures, with current counts and identity for readiness or an actionable diagnostic for failure.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/knowledge-query/src/corpus/corpus-status.ts",
    "apps/cli/src/root/knowledge/json-output.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "When source capture succeeds but OKF inspection contains error findings, should discovery report a ready but unhealthy corpus or refuse that corpus as unavailable?",
  ],
});

describe("Knowledge discovery health", () => {
  it.effect("reports ready source identity and changes identity after an edit", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const first = yield* reportKnowledgeCorpusStatus();
          expect(first).toMatchObject({
            readiness: "ready",
            bundleCount: 1,
            conceptCount: 2,
            health: { status: "healthy", diagnostics: [] },
          });
          expect(first.corpusFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
          workspace.writeDocument("session.md", knowledgeDocument("# Session\n\nRevised.\n"));
          const second = yield* reportKnowledgeCorpusStatus();
          expect(second.corpusFingerprint).not.toBe(first.corpusFingerprint);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  for (const condition of ["changing", "invalid-manifest"] as const)
    it.effect(condition, () => {
      const workspace = makeKnowledgeFixtureWorkspace({
        bundles: [
          { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
        ],
      });
      if (condition === "invalid-manifest")
        fs.writeFileSync(
          nodePath.join(workspace.root, "knowledge/platform/knowledge.json"),
          "{ invalid",
        );
      return workspace
        .provide(
          Effect.gen(function* () {
            const status =
              condition === "changing"
                ? yield* withChangingKnowledgeReads(reportKnowledgeCorpusStatus())
                : yield* reportKnowledgeCorpusStatus();
            expect(status.readiness).toBe(condition === "changing" ? "changing" : "unavailable");
            expect(status.health.status).toBe("unhealthy");
            expect(status.health.diagnostics.join(" ")).toMatch(
              condition === "changing" ? /chang/iu : /platform.*manifest/iu,
            );
            expect(status.corpusFingerprint).toBeUndefined();
            // Characterization of today's all-or-nothing capture, not an
            // adjudicated outcome: see this rule's open question.
            expect(status.bundleCount).toBe(0);
            expect(status.conceptCount).toBe(0);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    });
});

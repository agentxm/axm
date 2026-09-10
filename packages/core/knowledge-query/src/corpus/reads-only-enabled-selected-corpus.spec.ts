import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/reads-only-enabled-selected-corpus",
  title: "Discovery reads only enabled bundles in the selected workspace",
  statement:
    "When discovering Knowledge, AXM shall read the enabled bundles in the selected workspace regardless of instruction-entry visibility and reflect current source content without changing workspace state.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/help/topics/knowledge.md",
    "packages/core/workspace-projection/src/knowledge/installed-bundles.ts",
    "apps/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "This evidence observes the selection rule in a project workspace only. Which workspace a scope argument routes to, and that the unselected scope is neither read into the corpus nor written, are not observed here.",
      retirementCondition:
        "A user-scope Knowledge discovery example exists in apps/cli-e2e/src/knowledge.e2e.test.ts, or cli/installed-state-stays-in-selected-scope is revised to name Knowledge discovery reads.",
    },
  ],
});

describe("Selected Knowledge corpus", () => {
  const scope = "project" as const;
  it.effect(
    "includes instruction-hidden concepts, excludes disabled bundles, and observes later source edits",
    () => {
      const workspace = makeKnowledgeFixtureWorkspace({
        scope,
        bundles: [
          {
            name: "platform",
            instructionEntry: false,
            documents: { "session.md": knowledgeDocument("# Session\n\nOriginal.\n") },
          },
          {
            name: "disabled",
            enabled: false,
            documents: { "secret.md": knowledgeDocument("# Unselected\n") },
          },
        ],
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            const beforeRead = workspace.snapshot();
            const first = yield* KnowledgeDiscovery.query({ scope });
            if (first.outcome !== "ready") throw new Error("Expected a page");
            expect(first.page.items.map((item) => item.ref.bundle)).toEqual([
              "@acme/knowledge/platform",
            ]);
            expect(workspace.snapshot()).toEqual(beforeRead);

            const revised = knowledgeDocument("# Session\n\nRevised searchable content.\n");
            workspace.writeDocument("session.md", revised);
            const afterSourceEdit = workspace.snapshot();
            const searched = yield* KnowledgeDiscovery.search({ scope, expression: "revised" });
            if (searched.outcome !== "ready") throw new Error("Expected a page");
            expect(searched.page.items.map((item) => item.ref.conceptId)).toEqual(["session"]);
            expect(searched.page.corpusFingerprint).not.toBe(first.page.corpusFingerprint);
            expect(workspace.snapshot()).toEqual(afterSourceEdit);
            expect(workspace.readFile("knowledge/platform/src/session.md")).toBe(revised);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    },
  );
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleKnowledgeConceptQuery,
  handleKnowledgeConceptSearch,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/reads-only-enabled-selected-corpus",
  title: "Discovery reads only enabled bundles in the selected workspace",
  statement:
    "When discovering Knowledge, AXM shall read the enabled bundles in the selected workspace regardless of instruction-entry visibility and reflect current source content without changing workspace state.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/cli/src/root/knowledge/inspect.ts",
    "packages/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selected Knowledge corpus", () => {
  it.effect(
    "includes instruction-hidden concepts, excludes disabled bundles, and observes later source edits",
    () => {
      const workspace = makeKnowledgeSpecWorkspace({
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
      return workspace.provide(
        Effect.gen(function* () {
          const settings = workspace.readSettings();
          const lockfile = workspace.readLockfileText();
          yield* handleKnowledgeConceptQuery("project", knowledgeQueryOptions);
          const first = workspace.readQueryPage();
          expect(first.items.map((item) => item.ref.bundle)).toEqual(["@acme/knowledge/platform"]);
          workspace.writeDocument(
            "session.md",
            knowledgeDocument("# Session\n\nRevised searchable content.\n"),
          );
          yield* handleKnowledgeConceptSearch("revised", "project");
          expect(workspace.readQueryPage().items.map((item) => item.ref.conceptId)).toEqual([
            "session",
          ]);
          expect(workspace.readQueryPage().corpusFingerprint).not.toBe(first.corpusFingerprint);
          expect(workspace.readSettings()).toEqual(settings);
          expect(workspace.readLockfileText()).toBe(lockfile);
          expect(workspace.readFile("knowledge/platform/src/session.md")).toContain(
            "Revised searchable content.",
          );
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    },
  );
});

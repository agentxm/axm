import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleKnowledgeConceptGet,
  handleKnowledgeConceptSearch,
  handleKnowledgeConceptQuery,
  handleKnowledgeConceptRelated,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/renders-authored-text-safely",
  title: "Human discovery output preserves text without terminal control",
  statement:
    "When rendering bundle-authored Knowledge text for a person, AXM shall preserve ordinary text and line structure while displaying terminal-control and bidirectional-control characters as inert escapes.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/knowledge/concepts/terminal-text.ts",
    "packages/cli/src/root/knowledge/concepts/terminal-text.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Safe human Knowledge output", () => {
  const commands = [
    { name: "get", run: () => handleKnowledgeConceptGet("@acme/knowledge/platform#session") },
    {
      name: "get raw",
      run: () => handleKnowledgeConceptGet("@acme/knowledge/platform#session", { raw: true }),
    },
    { name: "search", run: () => handleKnowledgeConceptSearch("session", "project") },
    { name: "query", run: () => handleKnowledgeConceptQuery("project", knowledgeQueryOptions) },
    { name: "related", run: () => handleKnowledgeConceptRelated("@acme/knowledge/platform#root") },
  ];
  for (const command of commands)
    it.effect(command.name, () => {
      const workspace = makeKnowledgeSpecWorkspace({
        machine: false,
        screen: { kind: "human", columns: 240 },
        bundles: [
          {
            name: "platform",
            documents: {
              "session.md": knowledgeDocument("# Session \u001b[31mCafé\u202e\n\nOrdinary text.\n"),
              "root.md": knowledgeDocument("# Root\n\n[Session](session.md)\n"),
            },
          },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          yield* command.run();
          const output = workspace.streams?.lines("stdout").join("\n");
          expect(output).toContain("Café");
          expect(output).toContain("\\u{001b}");
          expect(output).toContain("\\u{202e}");
          expect(output).not.toContain("\u001b");
          expect(output).not.toContain("\u202e");
          if (command.name === "get") {
            expect(output).toContain("\n\nOrdinary text.");
            expect(output).not.toContain("description:");
          }
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});

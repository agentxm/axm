import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDocForArgs } from "../../test-support/command-tree-test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/groups-show-help-without-executing",
  title: "Command groups expose their leaves without executing an operation",
  statement:
    "Invoking the token or instructions group without a subcommand shall show group help without reading credentials, inspecting workspace state, or executing a mutation. Token inspection shall belong to token show, and instruction-file inspection shall belong to instructions status. Group examples shall name a leaf.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pure command groups", () => {
  it.effect.each([
    { group: "token", leaf: "show" },
    { group: "instructions", leaf: "status" },
  ])("$group shows its inspection leaf without runtime services", ({ group, leaf }) =>
    Effect.gen(function* () {
      // This capture provides parser/help services; neither an authenticated
      // runtime nor a workspace layer exists for a group to execute against.
      const doc = yield* captureHelpDocForArgs([group]);
      expect(doc.usage).toContain(`axm ${group}`);
      expect(
        doc.subcommands?.flatMap((section) => section.commands.map((command) => command.name)),
      ).toContain(leaf);
      for (const example of doc.examples ?? []) {
        expect(example.command).not.toBe(`axm ${group}`);
      }
    }),
  );
});

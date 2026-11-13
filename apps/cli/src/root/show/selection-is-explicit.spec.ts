import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDocForArgs } from "../../test-support/command-tree-test-helpers.js";
import { probeFlags } from "../../test-support/parser-probe.js";
import { selectLocalInspection } from "./command.js";

export const specification = defineSpecification({
  requirement: "cli/show/selection-is-explicit",
  title: "Local inspection requires one exact selection mode",
  statement:
    "Root and typed show commands shall accept ordered exact identities, repeated paths, or all selection, reject mixed modes and release or glob selectors before workspace construction, and display contextual usage when no selection is supplied.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
describe("Local inspection selection", () => {
  it.effect("honors help before rejecting mixed modes or consulting a workspace", () =>
    Effect.gen(function* () {
      const help = yield* captureHelpDocForArgs(["show", "review", "--all", "--help"]);
      expect(help.usage).toContain("axm show");
      expect(
        yield* probeFlags(
          ["show"],
          ["--type", "skill", "--type", "rule", "--scope", "user", "-C", "."],
        ),
      ).toBe("accepted");
    }),
  );
  for (const route of [
    [],
    ["skills"],
    ["mcps"],
    ["rules"],
    ["hooks"],
    ["subagents"],
    ["packs"],
    ["knowledge"],
  ]) {
    it.effect(`shows contextual usage for ${[...route, "show"].join(" ")}`, () =>
      Effect.gen(function* () {
        const help = yield* captureHelpDocForArgs([...route, "show"]);
        expect(help.usage).toContain(`axm ${[...route, "show"].join(" ")}`);
        expect(
          yield* probeFlags([...route, "show"], ["--path", "AGENTS.md", "--path", ".mcp.json"]),
        ).toBe("accepted");
        expect(
          yield* probeFlags([...route, "show"], ["--all", "--scope", "user", "--agent", "codex"]),
        ).toBe("accepted");
      }),
    );
  }
  for (const input of [
    { name: ["review"], path: ["AGENTS.md"], all: false },
    { name: ["review"], path: [], all: true },
    { name: [], path: ["AGENTS.md"], all: true },
    { name: ["review*"], path: [], all: false },
    { name: ["@acme/skills/review@1.2.3"], path: [], all: false },
  ])
    it.effect(`rejects ${JSON.stringify(input)}`, () =>
      Effect.gen(function* () {
        // The selection boundary has no filesystem, workspace, Registry or process services.
        const result = yield* Effect.result(selectLocalInspection(input, []));
        expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "usage" });
      }),
    );
});

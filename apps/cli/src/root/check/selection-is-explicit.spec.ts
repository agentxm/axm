import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDocForArgs } from "../../test-support/command-tree-test-helpers.js";
import { probeFlags } from "../../test-support/parser-probe.js";
import { selectLocalInspection } from "../show/command.js";

export const specification = defineSpecification({
  requirement: "cli/check/selection-is-explicit",
  title: "Local check requires one explicit local selection",
  statement:
    "Root and all typed check routes shall accept exact local identities, repeated paths, or all selection, reject mixed or nonlocal selectors before workspace construction, and show contextual usage without domain work when no selection is supplied.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Explicit local check selection", () => {
  for (const route of [
    [],
    ["skills"],
    ["subagents"],
    ["mcps"],
    ["rules"],
    ["hooks"],
    ["knowledge"],
    ["packs"],
  ]) {
    it.effect(`exposes assessment and selection on ${[...route, "check"].join(" ")}`, () =>
      Effect.gen(function* () {
        const help = yield* captureHelpDocForArgs([...route, "check"]);
        expect(help.usage).toContain(`axm ${[...route, "check"].join(" ")}`);
        expect(
          yield* probeFlags(
            [...route, "check"],
            ["--all", "--checks", "lint,ownership", "--strict", "--scope", "user"],
          ),
        ).toBe("accepted");
        expect(
          yield* probeFlags([...route, "check"], ["--path", "AGENTS.md", "--path", ".mcp.json"]),
        ).toBe("accepted");
      }),
    );
  }
  for (const input of [
    { name: ["review"], path: [], all: true },
    { name: ["review"], path: ["AGENTS.md"], all: false },
    { name: [], path: ["AGENTS.md"], all: true },
    { name: ["review*"], path: [], all: false },
    { name: ["@acme/skills/review@1.0.0"], path: [], all: false },
  ])
    it.effect(`rejects ${JSON.stringify(input)}`, () =>
      Effect.gen(function* () {
        // No workspace or filesystem service is provided at this admission boundary.
        const result = yield* Effect.result(selectLocalInspection(input, [], "check"));
        expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "usage" });
      }),
    );
});

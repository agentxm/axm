import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleSetup } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { probeFlag } from "../../support/parser-probe.js";
import { makeSetupSpecContext } from "../../support/setup-harness.js";

export const specification = defineSpecification({
  requirement: "cli/setup/unattended-apply-requires-explicit-intent",
  title: "Unattended setup applies only a fully explicit request",
  statement:
    "When setup runs unattended against an uninitialized directory, it shall apply only when preapproval, an explicit scope, and at least one explicit coding agent are all present, and a request missing any of them shall terminate with approval required and shall change no state.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["example"],
  derivedFrom: ["cli/machine-mode-never-prompts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface IncompleteRequest {
  readonly missing: string;
  readonly args: Parameters<typeof handleSetup>[0];
}

const incompleteRequests: ReadonlyArray<IncompleteRequest> = [
  {
    missing: "preapproval",
    args: { scope: "project", scopeExplicit: true, agents: ["claude-code"] },
  },
  {
    missing: "an explicit scope",
    args: { scope: "project", scopeExplicit: false, agents: ["claude-code"], yes: true },
  },
  {
    missing: "an explicit agent",
    args: { scope: "project", scopeExplicit: true, yes: true },
  },
];

describe("Unattended setup intent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(incompleteRequests)(
    "a request missing $missing terminates with approval required and changes nothing",
    ({ args }) =>
      Effect.gen(function* () {
        const context = makeSetupSpecContext({
          machine: true,
          flags: { nonInteractive: true, json: true },
          recordWrites: true,
        });
        cleanups.push(context.cleanup);

        const exit = yield* handleSetup(args).pipe(Effect.provide(context.layer), Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        const entry = context.rendererState.results.at(-1);
        expect(entry?.ok).toBe(false);
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "failed",
            status: "approval-required",
            reason: "approval-required",
            errorCode: "usage",
            changed: false,
          },
        });
        expect(context.rendererState.suggestions).toContainEqual({
          description: "Preview the setup candidate",
          cmd: "axm setup --preview --scope project",
        });
        expect(context.promptState.selectAgentsCalls).toEqual([]);
        expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
        expect(context.writes).toEqual([]);
        expect(context.exists("axm.json")).toBe(false);
        expect(context.exists("axm-lock.yaml")).toBe(false);
        expect(context.exists(".axm")).toBe(false);
        expect(context.exists("AGENTS.md")).toBe(false);
      }),
  );

  it.effect("a complete request applies exactly the explicit agents", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({
        machine: true,
        flags: { nonInteractive: true, json: true },
      });
      cleanups.push(context.cleanup);

      yield* handleSetup({
        scope: "project",
        scopeExplicit: true,
        agents: ["claude-code"],
        yes: true,
      }).pipe(Effect.provide(context.layer));

      expect(context.rendererState.results[0]?.data).toMatchObject({
        result: {
          outcome: "applied",
          status: "initialized",
          changed: true,
          agents: [{ id: "claude-code", name: "Claude Code" }],
        },
      });
      expect(context.promptState.selectAgentsCalls).toEqual([]);
      expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
      expect(context.exists("axm.json")).toBe(true);
      expect(context.exists("axm-lock.yaml")).toBe(true);
      const settings: unknown = JSON.parse(
        fs.readFileSync(path.join(context.root, "axm.json"), "utf8"),
      );
      expect(settings).toMatchObject({ agents: ["claude-code"] });
      expect(context.exists(".claude/skills/axm")).toBe(true);
    }),
  );

  it.effect("the route accepts the preapproval it documents", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["setup"], "--yes")).toBe("accepted");
      expect(yield* probeFlag(["setup"], "-y")).toBe("accepted");
    }),
  );
});

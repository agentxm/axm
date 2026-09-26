import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSetupFixture, type SetupFixture } from "../testing.js";
import { runSetup } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/setup/unattended-apply-requires-explicit-intent",
  title: "An unattended setup applies only what the request said explicitly",
  statement:
    "When setup would apply unattended to a workspace that has no settings, AXM shall apply only when preapproval, an explicit scope, and at least one explicit agent are all present, and shall otherwise report that approval is required without writing anything.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table"],
  derivedFrom: ["cli/machine-mode-never-prompts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface IncompleteRequest {
  readonly missing: string;
  readonly over: {
    readonly scopeExplicit?: boolean;
    readonly agents?: ReadonlyArray<string>;
    readonly yes?: boolean;
  };
}

const incompleteRequests: ReadonlyArray<IncompleteRequest> = [
  { missing: "preapproval", over: { scopeExplicit: true, agents: ["claude-code"] } },
  {
    missing: "an explicit scope",
    over: { scopeExplicit: false, agents: ["claude-code"], yes: true },
  },
  { missing: "an explicit agent", over: { scopeExplicit: true, yes: true } },
];

describe("Unattended setup intent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const request = (fixture: SetupFixture, over: IncompleteRequest["over"]) => ({
    scope: "project" as const,
    nonInteractive: true,
    projectRoot: decodeAbsolutePathSync(fixture.root),
    telemetryEnabled: false,
    ...over,
  });

  it.effect.each(incompleteRequests)(
    "a request missing $missing reports approval required and changes nothing",
    ({ over }) => {
      const fixture = makeSetupFixture();
      cleanups.push(fixture.cleanup);
      const projectBefore = fixture.snapshot();
      const userBefore = fixture.homeSnapshot();

      return fixture
        .provide(
          Effect.gen(function* () {
            const settled = yield* runSetup(request(fixture, over));

            expect(settled).toMatchObject({
              _tag: "ApprovalRequired",
              outcome: {
                outcome: "failed",
                status: "approval-required",
                reason: "approval-required",
                errorCode: "usage",
                changed: false,
              },
            });
            expect(fixture.snapshot()).toEqual(projectBefore);
            expect(fixture.homeSnapshot()).toEqual(userBefore);
            expect(fixture.promptState().selectAgentsCalls).toEqual([]);
            expect(fixture.promptState().confirmSetupPlanCalls).toEqual([]);
            expect(fixture.exists("axm.json")).toBe(false);
            expect(fixture.exists("axm-lock.yaml")).toBe(false);
            expect(fixture.exists(".axm")).toBe(false);
            expect(fixture.exists("AGENTS.md")).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("a complete request applies exactly the explicit agents", () => {
    const fixture = makeSetupFixture();
    cleanups.push(fixture.cleanup);

    return fixture
      .provide(
        Effect.gen(function* () {
          const settled = yield* runSetup(
            request(fixture, { scopeExplicit: true, agents: ["claude-code"], yes: true }),
          );

          expect(settled).toMatchObject({
            outcome: {
              outcome: "applied",
              status: "initialized",
              changed: true,
              agents: [{ id: "claude-code", name: "Claude Code" }],
            },
          });
          expect(fixture.promptState().selectAgentsCalls).toEqual([]);
          expect(fixture.promptState().confirmSetupPlanCalls).toEqual([]);
          expect(fixture.exists("axm.json")).toBe(true);
          expect(fixture.exists("axm-lock.yaml")).toBe(true);
          expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
            agents: ["claude-code"],
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});

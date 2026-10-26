import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  applyPlanExecution,
  deriveOperationOutcome,
  StepFailure,
  type ApplyConfirmation,
  type Plan,
  type PlanPolicyId,
} from "../../operations/index.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";
import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";

export const specification = defineSpecification({
  requirement: "workspace/acknowledge-external-execution",
  title: "External execution changes require deliberate acceptance",
  statement:
    "AXM shall require interactive acceptance or the invocation-scoped execution-change acknowledgment before applying a candidate that exposes new or changed external Hook or MCP execution, without letting generic preapproval, other overrides, or that acknowledgment bypass independent publisher consent or candidate freshness.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "The production candidate and transaction pipeline uses a temporary workspace and controlled confirmation port; this suite establishes acknowledgment and freshness enforcement, not kind-specific exposure classification.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const scenarios: ReadonlyArray<{
  name: string;
  policies: ReadonlyArray<PlanPolicyId>;
  answer?: ApplyConfirmation;
  publisher?: boolean;
  stale?: "settings" | "native";
  outcome: string;
  prompts: number;
}> = [
  {
    name: "generic preapproval cannot acknowledge execution",
    policies: [],
    outcome: "blocked",
    prompts: 0,
  },
  {
    name: "warning acceptance cannot acknowledge execution",
    policies: ["accept-warnings"],
    outcome: "blocked",
    prompts: 0,
  },
  {
    name: "explicit execution acknowledgment permits unattended apply",
    policies: ["accept-execution-changes"],
    outcome: "applied",
    prompts: 0,
  },
  {
    name: "interactive rejection commits nothing despite generic preapproval",
    policies: [],
    answer: "declined",
    outcome: "cancelled",
    prompts: 1,
  },
  {
    name: "interactive acceptance permits the reviewed candidate",
    policies: [],
    answer: "approved",
    outcome: "applied",
    prompts: 1,
  },
  {
    name: "execution acknowledgment cannot approve a publisher change",
    policies: ["accept-execution-changes"],
    publisher: true,
    outcome: "blocked",
    prompts: 0,
  },
  {
    name: "accepted execution still refuses changed settings",
    policies: ["accept-execution-changes"],
    stale: "settings",
    outcome: "blocked",
    prompts: 0,
  },
  {
    name: "accepted execution still refuses a changed native registration",
    policies: ["accept-execution-changes"],
    stale: "native",
    outcome: "blocked",
    prompts: 0,
  },
];

describe("Execution-change acknowledgment", () => {
  for (const scenario of scenarios) {
    it.effect(scenario.name, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* makeSpecWorkspace("axm-execution-consent-");
        const output = `${workspace.root}/applied`;
        const native = `${workspace.workspaceDir}/native-settings.json`;
        yield* fs.writeFileString(native, "{}");
        const context = makeSpecContext(workspace.workspaceDir, {
          confirmationAvailable: scenario.answer !== undefined,
          confirmApplyChanges: () => Effect.succeed(scenario.answer ?? "declined"),
        });
        const plan: Plan<FileSystem.FileSystem> = {
          _tag: "Plan",
          name: "Expose external execution",
          description: Option.none(),
          riskConditions: [
            {
              level: "override-required",
              id: "external-execution-changes",
              policy: "accept-execution-changes",
              requiredFlag: "--accept-execution-changes",
              detail: "An external Hook will become available",
            },
            ...(scenario.publisher
              ? [
                  {
                    level: "confirmable" as const,
                    consent: "interactive-only" as const,
                    id: "publisher-ownership-change",
                    detail: "Publisher changed",
                  },
                ]
              : []),
          ],
          jobs: [
            {
              concurrency: 1,
              steps: [
                {
                  readiness: "ready",
                  key: "hook:review",
                  label: "review",
                  artifact: {
                    path: "hook projections",
                    scope: "project",
                    change: "updated",
                    nativeLocations: [
                      {
                        scope: "project",
                        address: { kind: "file", path: native },
                        aliases: [],
                        configuredConsumers: ["claude-code"],
                        potentialReaders: ["claude-code"],
                        policyReasons: [],
                        ownership: "owned",
                        state: "updated",
                        availability: [],
                      },
                    ],
                  },
                  run: fs.writeFileString(output, "applied").pipe(
                    Effect.mapError(
                      (cause) =>
                        new StepFailure({
                          category: "internal",
                          detail: "Cannot write projection",
                          cause,
                        }),
                    ),
                    Effect.as({ result: "success" as const, message: "exposed" }),
                  ),
                },
              ],
            },
          ],
        };
        const candidate = yield* prepareExecutionCandidate(plan).pipe(
          Effect.provide(context.layer),
        );
        if (scenario.stale === "settings")
          yield* fs.writeFileString(workspace.settingsPath, '{"skills":{},"changed":true}');
        if (scenario.stale === "native") yield* fs.writeFileString(native, '{"human-change":true}');
        const result = yield* resolveExecutionCandidate(
          candidate,
          applyPlanExecution({
            approval: "preapproved",
            acceptedPolicies: new Set(scenario.policies),
            recovery: { command: ["sync"], arguments: [] },
          }),
        ).pipe(Effect.provide(context.layer));
        expect(deriveOperationOutcome(result)).toBe(scenario.outcome);
        expect(yield* fs.exists(output)).toBe(scenario.outcome === "applied");
        expect(context.interaction.state.confirmApplyChangesCalls).toHaveLength(scenario.prompts);
        if (scenario.outcome === "blocked" && !scenario.publisher && !scenario.stale) {
          expect(result.blocking?.class).toBe("override-required");
          expect(JSON.stringify(result.suggestions)).toContain("--accept-execution-changes");
        }
        if (scenario.stale) expect(result.blocking?.class).toBe("stale-candidate");
        if (scenario.publisher) expect(result.blocking?.subject).toBe("publisher-ownership-change");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});

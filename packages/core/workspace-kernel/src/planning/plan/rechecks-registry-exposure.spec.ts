import { PlanSources, makePlanSources } from "./plan-sources.js";
import { SourceHostProvidersTest } from "../../sources/testing.js";
import { NativePlatformTest } from "../../locations/testing.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ExactContentRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { RegistryClientFactoryTest, testRegistryEndpoint } from "@agentxm/registry-client/testing";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { RegistrySkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { defineSpecification } from "@agentxm/specification-metadata";
import { applyPlanExecution, type Plan } from "../../operations/index.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";
import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";

export const specification = defineSpecification({
  requirement: "workspace/recheck-registry-exposure",
  title: "Registry exposure requires current exact content eligibility",
  statement:
    "AXM shall check current exact Registry publisher, integrity and content eligibility before acquiring or exposing Registry content, including retained contributors, repeat the check after confirmation, and refuse each affected semantic closure while preserving independent work and operations that acquire or expose no Registry content.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "The real candidate pipeline and Registry client execute over a temporary workspace and controlled HTTP port. Request ordering and closure outcomes are observed; Registry server authorization remains covered by the server's transport evidence.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const ref: RegistrySkillRef = {
  type: "skill",
  refType: "registry",
  name: decodeExtensionNameSync("review"),
  owner: decodeHandleSync("@acme"),
  skill: {
    name: decodeExtensionNameSync("review"),
    description: Option.none(),
    metadata: Option.none(),
  },
  version: decodeVersionSync("1.0.0"),
  integrity: Option.some(`sha512-${"A".repeat(86)}==`),
  publisherBindingId: "publisher-1",
  packages: [],
  source: { type: "registry", name: "test", location: testRegistryEndpoint, owner: Option.none() },
};

describe("Registry eligibility at exposure", () => {
  for (const scenario of [
    "eligible",
    "denied",
    "revoked-during-confirmation",
    "no-registry-exposure",
    "ten-distinct",
    "hundred-and-one-distinct",
  ] as const) {
    it.effect(scenario, () =>
      Effect.gen(function* () {
        const workspace = yield* makeSpecWorkspace("axm-registry-exposure-");
        const requests: string[] = [];
        const batchSizes: number[] = [];
        const distinct =
          scenario === "ten-distinct" ? 10 : scenario === "hundred-and-one-distinct" ? 101 : 1;
        const exposureRefs =
          distinct === 1
            ? [ref, ref]
            : Array.from({ length: distinct }, (_, i) => ({
                ...ref,
                name: decodeExtensionNameSync(`review-${i}`),
                skill: { ...ref.skill, name: decodeExtensionNameSync(`review-${i}`) },
              }));
        let denied = scenario === "denied";
        let exposed = 0;
        let independent = 0;
        const http = HttpClient.make((request) =>
          Effect.sync(() => {
            requests.push(request.method);
            if (request.body._tag !== "Uint8Array") throw new Error("Expected JSON admission");
            const input = Schema.decodeUnknownSync(
              Schema.fromJsonString(ExactContentRequestSchema),
            )(new TextDecoder().decode(request.body.body));
            batchSizes.push(input.items.length);
            const response = Response.json({
              schemaVersion: 2,
              purpose: "authorize-exact",
              observedAt: "2026-09-22T00:00:00.000Z",
              results: input.items
                .map((item) =>
                  denied
                    ? { key: item.key, outcome: "unavailable" }
                    : {
                        key: item.key,
                        outcome: "allowed",
                        identity: item.identity,
                        publisherBindingId: item.expectedPublisherBinding,
                        accepted: item.accepted,
                        yanked: false,
                        observedAt: "2026-09-22T00:00:00.000Z",
                      },
                )
                .reverse(),
            });
            return HttpClientResponse.fromWeb(request, response);
          }),
        );
        const context = makeSpecContext(workspace.workspaceDir, {
          confirmationAvailable: true,
          confirmApplyChanges: () =>
            Effect.sync(() => {
              if (scenario === "revoked-during-confirmation") denied = true;
              return "approved" as const;
            }),
        });
        const plan: Plan = {
          _tag: "Plan",
          name: "Reconcile retained sources",
          description: Option.none(),
          riskConditions: [
            { level: "confirmable", id: "fixture-review", detail: "Review this candidate" },
          ],
          jobs: [
            {
              concurrency: 1,
              executionPolicy: "best-effort",
              steps: [
                ...exposureRefs.map((exposureRef, index) => ({
                  readiness: "ready" as const,
                  key: `skill:${index}`,
                  label: `step-${index}`,
                  acquisitionRefs: [],
                  exposureRefs: scenario === "no-registry-exposure" ? [] : [exposureRef],
                  run: Effect.sync(() => {
                    exposed += 1;
                    return { result: "success" as const, message: "exposed" };
                  }),
                })),
                {
                  readiness: "ready",
                  key: "authored:independent",
                  label: "independent",
                  run: Effect.sync(() => {
                    independent += 1;
                    return { result: "success" as const, message: "authored" };
                  }),
                },
              ],
            },
          ],
        };
        const candidate = yield* prepareExecutionCandidate(plan).pipe(
          Effect.provide(context.layer),
        );
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const result = yield* resolveExecutionCandidate(
          candidate,
          applyPlanExecution({
            approval: "prompt-if-interactive",
            recovery: { command: ["sync"], arguments: [] },
          }),
        ).pipe(
          Effect.withTracer(tracer),
          Effect.provide(
            Layer.merge(
              context.layer,
              Layer.effect(PlanSources, makePlanSources).pipe(
                Layer.provide(
                  Layer.merge(
                    SourceHostProvidersTest(),
                    RegistryClientFactoryTest(Layer.succeed(HttpClient.HttpClient, http)),
                  ),
                ),
              ),
            ),
          ),
        );
        const eligibility = spans.filter((span) => span.name === "axm.registry.eligibility");
        expect(eligibility.map((span) => span.attributes.get("axm.eligibility.phase"))).toEqual([
          "before-acquisition",
          "after-confirmation",
        ]);
        expect(eligibility.map((span) => span.attributes.get("axm.work.executed"))).toEqual(
          scenario === "no-registry-exposure" ? [0, 0] : [distinct, distinct],
        );
        expect(eligibility.map((span) => span.attributes.get("axm.registry.denied"))).toEqual(
          scenario === "denied"
            ? [1, 1]
            : scenario === "revoked-during-confirmation"
              ? [0, 1]
              : [0, 0],
        );
        expect(independent).toBe(1);
        expect(exposed).toBe(denied ? 0 : exposureRefs.length);
        expect(result.units.map((unit) => unit.state)).toEqual([
          ...exposureRefs.map(() => (denied ? "failed" : "committed")),
          "committed",
        ]);
        const expectedBatches =
          scenario === "no-registry-exposure"
            ? []
            : distinct === 101
              ? [100, 1, 100, 1]
              : [distinct, distinct];
        expect(batchSizes).toEqual(expectedBatches);
        expect(requests).toEqual(expectedBatches.map(() => "POST"));
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
    );
  }
});

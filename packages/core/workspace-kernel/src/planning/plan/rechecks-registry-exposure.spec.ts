import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
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
  ] as const) {
    it.effect(scenario, () =>
      Effect.gen(function* () {
        const workspace = yield* makeSpecWorkspace("axm-registry-exposure-");
        const requests: string[] = [];
        let denied = scenario === "denied";
        let exposed = 0;
        let independent = 0;
        const http = HttpClient.make((request) =>
          Effect.sync(() => {
            requests.push(request.method);
            const response =
              request.method === "HEAD"
                ? new Response(null, {
                    status: denied ? 403 : 200,
                    headers: { "x-integrity": `sha512-${"A".repeat(86)}==` },
                  })
                : new Response(
                    JSON.stringify({
                      schemaVersion: 1,
                      selectionPolicyVersion: "1",
                      observedAt: "2026-09-22T00:00:00.000Z",
                      results: [
                        {
                          key: "exact",
                          outcome: "metadata",
                          page: {
                            publisherBindingId: "publisher-1",
                            visibility: "public",
                            archival: null,
                            deprecation: null,
                            revision: "revision",
                            observedAt: "2026-09-22T00:00:00.000Z",
                            validUntil: "2026-09-22T00:00:30.000Z",
                            continuation: null,
                            versions: [
                              {
                                version: "1.0.0",
                                published: "2026-09-22T00:00:00.000Z",
                                integrity: `sha512-${"A".repeat(86)}==`,
                              },
                            ],
                          },
                        },
                      ],
                    }),
                    { status: 200 },
                  );
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
                ...["first", "second"].map((name) => ({
                  readiness: "ready" as const,
                  key: `skill:${name}`,
                  label: name,
                  acquisitionRefs: [],
                  exposureRefs: scenario === "no-registry-exposure" ? [] : [ref],
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
        const result = yield* resolveExecutionCandidate(
          candidate,
          applyPlanExecution({
            approval: "prompt-if-interactive",
            recovery: { command: ["sync"], arguments: [] },
          }),
        ).pipe(
          Effect.provide(
            Layer.merge(
              context.layer,
              RegistryClientFactoryTest(Layer.succeed(HttpClient.HttpClient, http)),
            ),
          ),
        );
        expect(independent).toBe(1);
        expect(exposed).toBe(denied ? 0 : 2);
        expect(result.units.map((unit) => unit.state)).toEqual(
          denied ? ["failed", "failed", "committed"] : ["committed", "committed", "committed"],
        );
        expect(requests).toEqual(
          scenario === "no-registry-exposure" ? [] : ["POST", "HEAD", "POST", "HEAD"],
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});

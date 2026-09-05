import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  RegistryAuthFailed,
  handleUnyank,
  handleVisibilityReconcile,
  handleVisibilitySet,
  handleYank,
} from "axm.sh/specification-harness";
import { authRegistry, storedAuthCredentials } from "../support/auth-harness.js";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  observedRevision,
  registryTarget,
  registryVersion,
  stepUpChallenge,
  stepUpRequestId,
  versionLifecycleResponse,
} from "../support/registry-management-harness.js";
import {
  makeVisibilityWorkspace,
  visibilityEvaluation,
  visibilityIntent,
} from "../support/visibility-harness.js";

export const specification = defineSpecification({
  requirement: "cli/registry-writes-complete-required-verification",
  title: "Challenged Registry writes complete the required verification before retrying",
  statement:
    "When yank, unyank, visibility set, or visibility reconcile receives a human-verification challenge, AXM shall present the action, target and verification URL, wait for that challenge's completion, retry the same mutation at most once with its verification identifier while preserving any observed revision, and report no success if verification or the retry fails.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "AgentXM Registry API 0.1.0",
    "packages/cli/src/root/step-up.ts",
    "packages/cli/src/root/lifecycle/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Registry mutation verification", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const command of ["yank", "unyank", "visibility set", "visibility reconcile"] as const) {
    for (const behavior of ["approved", "denied", "challenged-again"] as const) {
      it.effect(`${command}: ${behavior}`, () =>
        Effect.gen(function* () {
          const workspace = makeVisibilityWorkspace({ manifest: "private" });
          cleanups.push(workspace.cleanup);
          const intent = visibilityIntent("manifest", "private");
          const isVisibility = command.startsWith("visibility");
          const target = isVisibility ? registryTarget : registryVersion;
          const waits: Array<{ token: string; url: string; interval: number }> = [];
          let mutations = 0;
          const context = makeRegistryManagementContext(
            (request) => {
              if (request.method === "GET")
                return jsonRegistryResponse(
                  visibilityEvaluation(command === "visibility reconcile" ? intent : null),
                );
              mutations += 1;
              if (mutations === 1 || behavior === "challenged-again")
                return stepUpChallenge(target, command);
              return isVisibility
                ? jsonRegistryResponse({
                    target: registryTarget,
                    before: "public",
                    after: "private",
                    authority:
                      command === "visibility reconcile"
                        ? {
                            kind: "repository",
                            source: intent.source,
                            fingerprint: intent.fingerprint,
                          }
                        : { kind: "operator" },
                    result: "changed",
                    revision: "new-revision",
                  })
                : versionLifecycleResponse(command === "yank");
            },
            {
              auth: {
                waitForStepUpRequest: (token, url, interval) => {
                  waits.push({ token, url, interval });
                  return behavior === "denied"
                    ? Effect.fail(
                        new RegistryAuthFailed({ category: "auth", detail: "Verification denied" }),
                      )
                    : Effect.void;
                },
              },
            },
          );
          const selected =
            command === "yank"
              ? handleYank({
                  ref: registryVersion,
                  allVersions: false,
                  category: Option.some("security"),
                  notice: Option.some("Unsafe release."),
                })
              : command === "unyank"
                ? handleUnyank(registryVersion)
                : command === "visibility set"
                  ? handleVisibilitySet(registryTarget, "private")
                  : handleVisibilityReconcile(registryTarget);
          const operation: Effect.Effect<
            void,
            Effect.Error<typeof selected>,
            Effect.Services<typeof selected>
          > = selected;
          const exit = yield* operation.pipe(
            context.provide,
            Effect.provide(workspace.layer),
            Effect.exit,
          );
          expect(exit._tag).toBe(behavior === "approved" ? "Success" : "Failure");
          expect(waits).toEqual([
            {
              token: storedAuthCredentials.access_token,
              url: `${authRegistry}/v1/auth/step-up/requests/${stepUpRequestId}`,
              interval: 2,
            },
          ]);
          expect(context.interactionState.openBrowserCalls).toEqual([]);
          expect(context.rendererState.logs).toEqual(
            expect.arrayContaining([
              { _tag: "info", message: `Action: ${command}` },
              { _tag: "info", message: `Target: ${target}` },
              { _tag: "info", message: `Verify at: https://agentxm.ai/step-up/${stepUpRequestId}` },
            ]),
          );
          const writes = context.requests.filter(({ method }) => method !== "GET");
          expect(writes).toHaveLength(behavior === "denied" ? 1 : 2);
          expect(writes[0]?.stepUpRequest).toBeUndefined();
          if (behavior !== "denied") {
            expect(writes[1]?.stepUpRequest).toBe(stepUpRequestId);
            expect(writes[1]?.url.href).toBe(writes[0]?.url.href);
            expect(writes[1]?.method).toBe(writes[0]?.method);
            if (isVisibility) {
              expect(writes[0]?.ifMatch).toBe(observedRevision);
              expect(writes[1]?.ifMatch).toBe(observedRevision);
              expect(writes[1]?.body).toMatchObject({
                target: registryTarget,
                visibility: "private",
                revision: observedRevision,
                verification: stepUpRequestId,
              });
            } else expect(writes[1]?.body).toEqual(writes[0]?.body);
          }
          expect(context.rendererState.results).toHaveLength(behavior === "approved" ? 1 : 0);
        }),
      );
    }
  }
});

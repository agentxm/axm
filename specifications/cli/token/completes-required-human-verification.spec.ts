import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import {
  RegistryAuthFailed,
  RegistryProblem,
  StepUpRequired,
  getAppError,
  handleCreateToken,
  handleRevokeToken,
} from "axm.sh/specification-harness";
import { authCredentialFile, authExpiry, makeAuthSpecContext } from "../../support/auth-harness.js";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/token/completes-required-human-verification",
  title: "Token administration waits for required human verification",
  statement:
    "When the Registry requires human verification for token creation or revocation, AXM shall present the verification action, wait for its approval, and retry the unchanged request with that verification identifier only after approval, without opening a browser in machine mode.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/token.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Required human verification", () => {
  for (const command of ["create", "revoke"] as const) {
    for (const approved of [true, false]) {
      it.effect(`${command}: ${approved ? "approved" : "denied"}`, () => {
        const stepUp = {
          requestId: "fixture-verification",
          verificationUrl: "https://identity.example.test/verify/fixture-verification",
          statusUrl: "https://registry.example.test/verification/fixture-verification",
          expiresAt: "2099-01-01T00:00:00.000Z",
          intervalSeconds: 1,
          action: command === "create" ? "Create access token" : "Revoke access token",
          target: "automation",
        };
        const requests: Array<{
          token: string;
          intent: unknown;
          verification: string | undefined;
        }> = [];
        const waits: unknown[] = [];
        const checkVerification = (
          token: string,
          intent: unknown,
          verification: string | undefined,
        ) =>
          Effect.gen(function* () {
            requests.push({ token, intent, verification });
            if (verification === undefined)
              return yield* new StepUpRequired({
                stepUp,
                failure: new RegistryProblem({
                  category: "auth",
                  metadata: { response: { status: 401 } },
                  cause: undefined,
                }),
              });
            expect(waits).toHaveLength(1);
          });
        const context = makeAuthSpecContext({
          credentials: authCredentialFile,
          auth: {
            createToken: (token, params, options) =>
              checkVerification(token, params, options?.stepUpRequestId).pipe(
                Effect.as({
                  id: "fixture-created",
                  token: "fixture-issued-secret",
                  name: "automation",
                  scopes: ["extensions:admin"],
                  permissions: null,
                  createdAt: authExpiry,
                  expiresAt: authExpiry,
                }),
              ),
            deleteToken: (token, id, options) =>
              checkVerification(token, id, options?.stepUpRequestId),
            waitForStepUpRequest: (token, url, interval) =>
              Effect.gen(function* () {
                waits.push({ token, url, interval });
                if (!approved)
                  return yield* new RegistryAuthFailed({
                    category: "auth_denied",
                    detail: "Fixture verification denied",
                  });
              }),
          },
        });
        return context.provide(
          Effect.gen(function* () {
            const operation =
              command === "create"
                ? handleCreateToken({
                    name: "automation",
                    expires: "7d",
                    owners: [],
                    extensions: [],
                    permission: Option.some("admin"),
                    orgPermission: Option.none(),
                    cidr: [],
                    bypassMfa: false,
                  })
                : handleRevokeToken("automation");
            if (approved) {
              yield* operation;
              expect(requests).toHaveLength(2);
              expect(requests[1]).toEqual({ ...requests[0], verification: stepUp.requestId });
              expect(context.rendererState.results[0]?.data).toMatchObject({
                result: { stepUpCompleted: true },
              });
            } else {
              expect(getAppError(yield* operation.pipe(Effect.flip)).code).toBe("auth_denied");
              expect(requests).toHaveLength(1);
              expect(context.rendererState.results).toEqual([]);
            }
            expect(waits).toEqual([
              {
                token: "fixture-stored-access",
                url: stepUp.statusUrl,
                interval: stepUp.intervalSeconds,
              },
            ]);
            expect(context.interactionState.openBrowserCalls).toEqual([]);
            expect(JSON.stringify(context.rendererState.logs)).toContain(stepUp.verificationUrl);
            expect(JSON.stringify(context.rendererState.logs)).toContain(stepUp.action);
          }),
        );
      });
    }
  }
});

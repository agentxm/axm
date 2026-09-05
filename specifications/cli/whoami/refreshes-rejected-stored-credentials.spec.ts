import { describe, expect, it } from "@effect/vitest";
import { afterEach, vi } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AuthClientTest, CredentialStoreTest } from "@agentxm/registry-auth/testing";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleWhoami,
  getAppError,
  RegistryProblem,
  RegistryUrl,
  TestFlagsLayer,
  TestMachineRenderer,
} from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/whoami/refreshes-rejected-stored-credentials",
  title: "Identity inspection recovers an expired stored session",
  statement:
    "When the Registry rejects identity credentials with HTTP 401, whoami shall recover a stored session by refreshing and persisting its replacement credentials and retrying once, report authentication required when rejection remains, and leave ambient credentials and other failures without refresh retries.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");
const expiry = DateTime.makeUnsafe("2099-01-01");
afterEach(() => vi.unstubAllEnvs());

describe("Stored session recovery", () => {
  for (const scenario of ["expired", "rejected-replacement", "ambient", "forbidden"] as const) {
    it.effect(scenario, () =>
      Effect.gen(function* () {
        vi.stubEnv("AXM_TOKEN", scenario === "ambient" ? "ambient-token" : "");
        vi.stubEnv("AXM_TOKEN_FILE", "");
        const presented: string[] = [];
        const refreshed: string[] = [];
        const renderer = TestMachineRenderer.make();
        const auth = AuthClientTest({
          getMe: (token) =>
            Effect.suspend(() => {
              presented.push(token);
              if (scenario === "expired" && token === "replacement-access") {
                return Effect.succeed({
                  userHandle: handle,
                  tokenType: "session",
                  scopes: ["account:read"],
                  resourceRestrictions: { extensions: null },
                  expiresAt: expiry,
                });
              }
              return Effect.fail(
                new RegistryProblem({
                  category: scenario === "forbidden" ? "forbidden" : "auth",
                  metadata: { response: { status: scenario === "forbidden" ? 403 : 401 } },
                  cause: undefined,
                }),
              );
            }),
          refreshToken: (token) =>
            Effect.sync(() => {
              refreshed.push(token);
              return {
                access_token: "replacement-access",
                refresh_token: "replacement-refresh",
                expires_at: expiry,
              };
            }),
        });
        yield* Effect.gen(function* () {
          if (scenario === "expired") {
            yield* handleWhoami();
            yield* handleWhoami();
            expect(presented).toEqual([
              "expired-access",
              "replacement-access",
              "replacement-access",
            ]);
            expect(renderer.state.results).toHaveLength(2);
          } else {
            const failure = yield* handleWhoami().pipe(Effect.flip);
            expect(getAppError(failure).code).toBe(
              scenario === "forbidden" ? "forbidden" : "auth_required",
            );
            expect(presented).toEqual(
              scenario === "rejected-replacement"
                ? ["expired-access", "replacement-access"]
                : [scenario === "ambient" ? "ambient-token" : "expired-access"],
            );
            expect(renderer.state.results).toHaveLength(0);
          }
          expect(refreshed).toEqual(
            scenario === "expired" || scenario === "rejected-replacement" ? ["stored-refresh"] : [],
          );
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              renderer.layer,
              TestFlagsLayer(),
              Layer.succeed(RegistryUrl, registry),
              auth,
              CredentialStoreTest("restricted-file", {
                version: 1,
                registries: {
                  [registry]: {
                    accounts: {
                      [handle]: {
                        access_token: "expired-access",
                        refresh_token: "stored-refresh",
                        expires_at: expiry,
                        active: true,
                      },
                    },
                  },
                },
              }),
            ),
          ),
        );
      }),
    );
  }
});

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { RegistryProblem } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { AuthLoginRequired } from "./errors.js";
import { currentIdentity } from "./identity.js";
import { makeAuthPorts } from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/whoami/refreshes-rejected-stored-credentials",
  title: "Identity inspection recovers an expired stored session",
  statement:
    "When the Registry rejects identity credentials with HTTP 401, AXM shall recover a stored session by refreshing and persisting its replacement credentials and retrying once, report authentication required when rejection remains, and leave ambient credentials and other failures without refresh retries.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/identity.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Is this the authority for registry-auth's generic Registry-request 401 recovery, which auth-middleware.ts implements for every authenticated request, or only for identity inspection? cli/registry-management-preserves-authentication-failures asserts no replay for lifecycle and visibility writes holding a stored session, so one of the two must name the credential class it governs.",
  ],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");
const expiry = DateTime.makeUnsafe("2099-01-01");

describe("Stored session recovery", () => {
  for (const scenario of ["expired", "rejected-replacement", "ambient", "forbidden"] as const) {
    it.effect(scenario, () => {
      const presented: Array<string> = [];
      const refreshed: Array<string> = [];
      const { layer } = makeAuthPorts({
        environment: scenario === "ambient" ? { AXM_TOKEN: "ambient-token" } : {},
        credentials: {
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
        },
        auth: {
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
        },
      });

      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        if (scenario === "expired") {
          expect(yield* currentIdentity(registry)).toMatchObject({
            user: "@alice",
            registry,
            scopes: ["account:read"],
          });
          // The replacement was persisted, so the next read presents it directly.
          expect(Option.getOrThrow(yield* store.load(registry))).toMatchObject({
            access_token: "replacement-access",
            refresh_token: "replacement-refresh",
          });
          yield* currentIdentity(registry);
          expect(presented).toEqual(["expired-access", "replacement-access", "replacement-access"]);
        } else {
          const failure = yield* currentIdentity(registry).pipe(Effect.flip);
          if (scenario === "forbidden") {
            expect(failure).toBeInstanceOf(RegistryProblem);
            expect(failure).toMatchObject({ category: "forbidden" });
          } else {
            expect(failure).toBeInstanceOf(AuthLoginRequired);
          }
          expect(presented).toEqual(
            scenario === "rejected-replacement"
              ? ["expired-access", "replacement-access"]
              : [scenario === "ambient" ? "ambient-token" : "expired-access"],
          );
        }
        expect(refreshed).toEqual(
          scenario === "expired" || scenario === "rejected-replacement" ? ["stored-refresh"] : [],
        );
      }).pipe(Effect.provide(layer));
    });
  }
});

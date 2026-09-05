import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { authCredentialFile, makeAuthSpecContext } from "../../../support/auth-harness.js";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());
import { CredentialStore } from "axm.sh/specification-harness";
import { authExpiry, authRegistry } from "../../../support/auth-harness.js";
import { handleCreateToken } from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/token/create/submits-requested-authority",
  title: "Token creation requests the chosen lifetime and permissions",
  statement:
    "When creating a token, AXM shall submit the requested name, lifetime, and permission restrictions using the effective credential and report the issued token without replacing the current session.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/token.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Which token-lifetime input forms, omitted-input default, and valid range should the CLI guarantee? Command help and parser tests are witnesses for the current forms and default; this requirement allocates submission of the selected lifetime, not an undecided lifetime-input policy.",
  ],
});

describe("Token creation", () => {
  for (const bypassMfa of [false, true])
    it.effect("preserves requested restrictions with bypass MFA " + bypassMfa, () => {
      const requests: unknown[] = [];
      const created = {
        id: "token-fixture",
        name: "automation",
        token: "fixture-issued-secret",
        scopes: ["extensions:read"],
        permissions: null,
        createdAt: authExpiry,
        expiresAt: authExpiry,
      };
      const context = makeAuthSpecContext({
        credentials: authCredentialFile,
        auth: {
          createToken: (token, params) =>
            Effect.sync(() => {
              requests.push({ token, params });
              return created;
            }),
        },
      });
      return context.provide(
        Effect.gen(function* () {
          const store = yield* CredentialStore;
          const before = yield* store.load(authRegistry);
          yield* handleCreateToken({
            name: "automation",
            expires: "7d",
            owners: ["@alice"],
            extensions: ["@alice/skills/review"],
            permission: Option.some("read"),
            orgPermission: Option.some("read"),
            cidr: ["192.0.2.0/24"],
            bypassMfa,
          });
          expect(requests).toEqual([
            {
              token: "fixture-stored-access",
              params: {
                name: "automation",
                expiresIn: 604800,
                permissions: {
                  owners: ["@alice"],
                  extensions: ["@alice/skills/review"],
                  permission: "read",
                  org_permission: "read",
                  cidr: ["192.0.2.0/24"],
                  ...(bypassMfa ? { bypass_mfa: true } : {}),
                },
              },
            },
          ]);
          expect(context.rendererState.results).toHaveLength(1);
          expect(context.rendererState.results[0]?.data).toMatchObject({
            result: { status: "created", tokenId: created.id },
            data: {
              id: created.id,
              token: created.token,
              name: created.name,
              scopes: created.scopes,
              createdAt: created.createdAt,
              expiresAt: created.expiresAt,
            },
          });
          expect(yield* store.load(authRegistry)).toEqual(before);
        }),
      );
    });
});

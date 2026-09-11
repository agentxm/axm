import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "../credential-store.js";
import {
  authCredentialFile,
  authExpiry,
  authRegistry,
  makeAuthPorts,
} from "../spec-support/test-helpers.js";
import { createToken } from "../tokens.js";

export const specification = defineSpecification({
  requirement: "cli/token/create/submits-requested-authority",
  title: "Token creation requests the chosen lifetime and permissions",
  statement:
    "When creating a token, AXM shall submit the requested name, lifetime, and permission restrictions using the effective credential and report the issued token without replacing the current session.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/tokens.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Which token-lifetime input forms, omitted-input default, and valid range should the CLI guarantee? Command help and parser tests are witnesses for the current forms and default; this requirement allocates submission of the selected lifetime, not an undecided lifetime-input policy.",
  ],
});

describe("Token creation", () => {
  for (const bypassMfa of [false, true]) {
    it.effect(`preserves requested restrictions with bypass MFA ${bypassMfa}`, () => {
      const requests: Array<unknown> = [];
      const created = {
        id: "token-fixture",
        name: "automation",
        token: "fixture-issued-secret",
        scopes: ["extensions:read"],
        permissions: null,
        createdAt: authExpiry,
        expiresAt: authExpiry,
      };
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        auth: {
          createToken: (token, params) =>
            Effect.sync(() => {
              requests.push({ token, params });
              return created;
            }),
        },
      });
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        const before = yield* store.load(authRegistry);

        const result = yield* createToken(
          {
            name: "automation",
            expires: "7d",
            owners: ["@alice"],
            extensions: ["@alice/skills/review"],
            permission: Option.some("read"),
            orgPermission: Option.some("read"),
            cidr: ["192.0.2.0/24"],
            bypassMfa,
            verification: { unattended: true },
          },
          authRegistry,
        );

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
        expect(result).toEqual({ token: created, stepUpCompleted: false });
        expect(yield* store.load(authRegistry)).toEqual(before);
      }).pipe(Effect.provide(layer));
    });
  }
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "../../credentials/credential-store.js";
import {
  authCredentialFile,
  authExpiry,
  authRegistry,
  makeAuthPorts,
} from "../test-support/test-helpers.js";
import { createToken } from "../tokens.js";

export const specification = defineSpecification({
  requirement: "cli/token/create/submits-requested-authority",
  title: "Token creation requests the chosen lifetime and permissions",
  statement:
    "When creating a token, AXM shall submit the requested name, lifetime, and permission restrictions, and report the issued token without replacing the current session.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/tokens.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Token creation", () => {
  for (const permission of ["read", "publish", "admin"] as const) {
    it.effect(`submits the requested ${permission} authority`, () => {
      const requests: Array<unknown> = [];
      const created = {
        id: "token-fixture",
        name: "automation",
        token: "fixture-issued-secret",
        permissions: {
          model: "gat" as const,
          owners: ["@alice"],
          extensions: ["@alice/skills/review"],
          permission,
        },
        createdAt: authExpiry,
        expiresAt: authExpiry,
      };
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        auth: {
          createToken: (params) =>
            Effect.sync(() => {
              requests.push({ params });
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
            permission,
          },
          authRegistry,
        );

        expect(requests).toEqual([
          {
            params: {
              name: "automation",
              expiresIn: 604800,
              permissions: {
                owners: ["@alice"],
                extensions: ["@alice/skills/review"],
                permission,
              },
            },
          },
        ]);
        expect(result).toEqual({ token: created });
        expect(yield* store.load(authRegistry)).toEqual(before);
      }).pipe(Effect.provide(layer));
    });
  }
});

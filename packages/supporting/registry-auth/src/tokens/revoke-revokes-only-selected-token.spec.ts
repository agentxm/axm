import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { RegistryAuthFailed } from "../errors.js";
import {
  authCredentialFile,
  authFailureCategory,
  authRegistry,
  makeAuthPorts,
} from "../spec-support/test-helpers.js";
import { revokeToken } from "../tokens.js";

export const specification = defineSpecification({
  requirement: "cli/token/revoke/revokes-only-selected-token",
  title: "Token revocation names the selected credential",
  statement:
    "When token revoke is requested, AXM shall request deletion of the selected token identifier using the effective credential and report success only after the Registry accepts deletion.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/tokens.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Token revocation", () => {
  for (const accepted of [true, false]) {
    it.effect(accepted ? "accepted deletion" : "refused deletion", () => {
      const requests: Array<unknown> = [];
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        auth: {
          deleteToken: (token, id) =>
            Effect.gen(function* () {
              requests.push({ token, id });
              if (!accepted)
                return yield* new RegistryAuthFailed({
                  category: "auth",
                  detail: "Fixture refusal",
                });
            }),
        },
      });
      return Effect.gen(function* () {
        const operation = revokeToken("selected-token", { unattended: true }, authRegistry);
        if (accepted) {
          expect(yield* operation).toEqual({
            tokenId: "selected-token",
            stepUpCompleted: false,
          });
        } else {
          expect(authFailureCategory(yield* operation.pipe(Effect.flip))).toBe("auth");
        }
        expect(requests).toEqual([{ token: "fixture-stored-access", id: "selected-token" }]);
      }).pipe(Effect.provide(layer));
    });
  }
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { afterEach, beforeEach, vi } from "vitest";
import { authCredentialFile, makeAuthSpecContext } from "../../../support/auth-harness.js";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());
import { authExpiry } from "../../../support/auth-harness.js";
import { handleListTokens } from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/token/list/reports-token-inventory",
  title: "Token listing reports Registry inventory and completeness",
  statement:
    "When token list succeeds, AXM shall report the Registry token metadata and pagination state without including token secrets.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/token.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Token inventory", () => {
  for (const empty of [false, true]) {
    it.effect(empty ? "empty inventory" : "partial inventory", () => {
      const item = {
        id: "token-fixture",
        name: "automation",
        type: "granular",
        scopes: ["extensions:read"],
        permissions: null,
        createdAt: authExpiry,
        expiresAt: authExpiry,
        lastUsedAt: null,
        token: "fixture-hidden-secret",
      };
      const context = makeAuthSpecContext({
        credentials: authCredentialFile,
        auth: {
          listTokens: (token) =>
            Effect.sync(() => {
              expect(token).toBe("fixture-stored-access");
              return {
                tokens: empty ? [] : [item],
                hasMore: !empty,
                cursor: empty ? null : "next-page",
              };
            }),
        },
      });
      return context.provide(
        Effect.gen(function* () {
          yield* handleListTokens();
          const output = context.rendererState.results;
          expect(output).toHaveLength(1);
          expect(output[0]?.data).toMatchObject({
            items: empty
              ? []
              : [{ id: item.id, name: item.name, scopes: item.scopes, lastUsedAt: null }],
            count: empty ? 0 : 1,
            hasMore: !empty,
            cursor: empty ? null : "next-page",
          });
          expect(JSON.stringify(output)).not.toContain("fixture-hidden-secret");
          expect(JSON.stringify(output)).not.toContain("fixture-stored-access");
        }),
      );
    });
  }
});

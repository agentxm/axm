import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { AuthEnvironment } from "@agentxm/registry-auth";
import { AuthClientTest, CredentialStoreTest } from "@agentxm/registry-auth/testing";
import { RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { AuthLoginPresenterLive } from "../../auth-login-presenter.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer } from "../../test-support/presenter-test.js";
import { handleListTokens, TokenListDocumentSchema } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/list/reports-token-inventory",
  title: "Token listing reports Registry inventory and completeness",
  statement:
    "When token list succeeds, AXM shall report the Registry token metadata and pagination state without including token secrets.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example", "contract"],
  derivedFrom: ["apps/cli/src/root/auth/token.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");
const expiry = DateTime.makeUnsafe("2099-01-01T00:00:00.000Z");

describe("Token inventory", () => {
  for (const empty of [false, true]) {
    it.effect(empty ? "empty inventory" : "partial inventory", () => {
      const item = {
        id: "token-fixture",
        name: "automation",
        type: "granular",
        scopes: ["extensions:read"],
        permissions: null,
        createdAt: expiry,
        expiresAt: expiry,
        lastUsedAt: null,
        token: "fixture-hidden-secret",
      };
      const renderer = TestMachineRenderer.make();
      const ports = Layer.mergeAll(
        renderer.layer,
        TestFlagsLayer({ json: true }),
        Layer.succeed(RegistryUrl, registry),
        Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord({})),
        AuthClientTest({
          listTokens: (token) =>
            Effect.sync(() => {
              expect(token).toBe("fixture-stored-access");
              return {
                tokens: empty ? [] : [item],
                hasMore: !empty,
                cursor: empty ? null : "next-page",
              };
            }),
        }),
        CredentialStoreTest("restricted-file", {
          version: 1,
          registries: {
            [registry]: {
              accounts: {
                [handle]: {
                  access_token: "fixture-stored-access",
                  refresh_token: "fixture-stored-refresh",
                  expires_at: expiry,
                  active: true,
                },
              },
            },
          },
        }),
      );
      const layer = Layer.provideMerge(AuthLoginPresenterLive, ports);

      return Effect.gen(function* () {
        yield* handleListTokens();

        const output = renderer.state.results;
        expect(output).toHaveLength(1);
        expect(Schema.encodeUnknownSync(TokenListDocumentSchema)(output[0]?.data)).toMatchObject({
          items: empty
            ? []
            : [{ id: item.id, name: item.name, scopes: item.scopes, lastUsedAt: null }],
          count: empty ? 0 : 1,
          hasMore: !empty,
          cursor: empty ? null : "next-page",
        });
        expect(JSON.stringify(output)).not.toContain("fixture-hidden-secret");
        expect(JSON.stringify(output)).not.toContain("fixture-stored-access");
      }).pipe(Effect.provide(layer));
    });
  }
});

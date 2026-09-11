import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AuthEnvironment } from "@agentxm/registry-auth";
import { CredentialStoreTest } from "@agentxm/registry-auth/testing";
import { RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer, TestRenderer } from "../../test-support/presenter-test.js";
import { handleToken } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/returns-effective-token",
  title: "Token output exposes the effective credential on request",
  statement:
    "When a credential is available, axm token shall return that credential alone as text by default or as a structured token value when JSON output is requested.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/auth/token.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");

describe("Explicit token output", () => {
  for (const machine of [false, true]) {
    it.effect(machine ? "structured token" : "raw token", () => {
      const renderer = machine ? TestMachineRenderer.make() : TestRenderer.make();
      const layer = Layer.mergeAll(
        renderer.layer,
        TestFlagsLayer({ json: machine }),
        Layer.succeed(RegistryUrl, registry),
        // No ambient token: the saved session is the effective credential.
        Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord({})),
        CredentialStoreTest("restricted-file", {
          version: 1,
          registries: {
            [registry]: {
              accounts: {
                [handle]: {
                  access_token: "fixture-stored-access",
                  refresh_token: "fixture-stored-refresh",
                  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
                  active: true,
                },
              },
            },
          },
        }),
      );

      return Effect.gen(function* () {
        yield* handleToken();
        if (machine) {
          expect(renderer.state.results[0]?.data).toEqual({
            data: { token: "fixture-stored-access" },
          });
        } else {
          expect(renderer.state.logs).toEqual([
            { _tag: "message", message: "fixture-stored-access\n" },
          ]);
        }
      }).pipe(Effect.provide(layer));
    });
  }
});

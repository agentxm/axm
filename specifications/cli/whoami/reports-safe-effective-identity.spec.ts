import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AuthClientTest, CredentialStoreTest } from "@agentxm/registry-auth/testing";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleWhoami,
  WhoamiDocumentSchema,
  RegistryUrl,
  TestFlagsLayer,
  TestMachineRenderer,
  TestRenderer,
} from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/whoami/reports-safe-effective-identity",
  title: "Identity inspection reports safe effective authority",
  statement:
    "When authenticated, whoami shall report the handle, Registry, credential type, effective scopes, enforced extension restrictions, and source-backed or unavailable expiry from the canonical Registry identity operation in human and machine output, excluding email, credential identifiers, token material, and internal permission markers.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["example", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const credential = "axm_ses_secret_fixture";
const expiryCases = [null, "2099-06-01T00:00:00.000Z"];

describe("Safe effective identity", () => {
  for (const machine of [false, true]) {
    for (const expiresAt of expiryCases) {
      it.effect(
        `reports ${machine ? "machine" : "human"} identity with ${expiresAt ?? "unavailable"} expiry`,
        () =>
          Effect.gen(function* () {
            const renderer = machine ? TestMachineRenderer.make() : TestRenderer.make();
            const registryLayer = Layer.succeed(RegistryUrl, registry);
            const authLayer = AuthClientTest({
              getMe: (presented) =>
                Effect.sync(() => {
                  expect(presented).toBe(credential);
                  return {
                    userHandle: normalizeHandle("@alice"),
                    tokenType: "session",
                    scopes: ["extensions:read", "extensions:publish:version"],
                    resourceRestrictions: { extensions: ["@alice/skills/review"] },
                    expiresAt: expiresAt === null ? null : DateTime.makeUnsafe(expiresAt),
                    email: "private@example.test",
                    userId: "user_01h455vb4pexka56gq5w2r7cpc",
                    credentialId: "tok_01h455vb4pexka56gq5w2r7cpc",
                    name: "private-credential-name",
                    permissions: { bypass_mfa: true, cidr: ["192.0.2.0/24"] },
                  };
                }),
            });
            const layer = Layer.mergeAll(
              renderer.layer,
              TestFlagsLayer(),
              registryLayer,
              authLayer,
              CredentialStoreTest("restricted-file", {
                version: 1,
                registries: {
                  [registry]: {
                    accounts: {
                      [normalizeHandle("@alice")]: {
                        access_token: credential,
                        refresh_token: "axm_ref_private_fixture",
                        expires_at: DateTime.makeUnsafe("2099-01-01"),
                        active: true,
                      },
                    },
                  },
                },
              }),
            );
            yield* handleWhoami().pipe(Effect.provide(layer));
            const output = JSON.stringify(machine ? renderer.state.results : renderer.state.logs);
            for (const secret of [
              "private@example.test",
              "user_01h455vb4pexka56gq5w2r7cpc",
              "tok_01h455vb4pexka56gq5w2r7cpc",
              "private-credential-name",
              credential,
              "axm_ref_private_fixture",
              "permissions",
              "bypass_mfa",
              "192.0.2.0/24",
            ]) {
              expect(output).not.toContain(secret);
            }
            if (machine) {
              expect(renderer.state.results).toHaveLength(1);
              expect(
                Schema.encodeUnknownSync(WhoamiDocumentSchema)(renderer.state.results[0]?.data),
              ).toEqual({
                data: {
                  user: "@alice",
                  registry,
                  credentialType: "session",
                  scopes: ["extensions:read", "extensions:publish:version"],
                  resourceRestrictions: { extensions: ["@alice/skills/review"] },
                  expiresAt,
                },
              });
            } else {
              for (const text of [
                "@alice",
                registry,
                "session",
                "extensions:read",
                "extensions:publish:version",
                "@alice/skills/review",
                expiresAt ?? "unavailable",
              ])
                expect(output).toContain(text);
            }
          }),
      );
    }
  }
});

import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AuthClientTest, CredentialStoreTest } from "@agentxm/registry-access/testing";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";
import { RegistryUrl } from "@agentxm/registry-client";

import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer, TestRenderer } from "../../test-support/presenter-test.js";
import { handleWhoami, WhoamiDocumentSchema } from "./whoami.js";

export const specification = defineSpecification({
  requirement: "cli/whoami/reports-safe-effective-identity",
  title: "Identity inspection shows the active identity and permissions",
  statement:
    "When signed in, whoami shall report the handle, Registry, credential type, credential authority, the approving sign-in time when there is one, and source-backed or unavailable expiry from the canonical Registry identity operation in human and machine output; it shall report the permission level, its owner and extension allowlist, and enforced extension restrictions only for a limited credential, in the vocabulary a token is described in, and shall exclude email, credential identifiers, token material, and the Registry's internal scope strings and permission markers.",
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
              // The transport carries the credential, so the identity read
              // names none: whoami reports what the Registry answers for
              // whoever this invocation is.
              getMe: () =>
                Effect.sync(() => ({
                  // A limited credential, so the limits themselves are part of
                  // the answer; everything else the Registry knows is not.
                  userHandle: normalizeHandle("@alice"),
                  tokenType: "pat",
                  authority: "limited" as const,
                  permissions: {
                    owners: ["@alice"],
                    extensions: [],
                    permission: "publish" as const,
                  },
                  resourceRestrictions: { extensions: ["@alice/skills/review"] },
                  expiresAt: expiresAt === null ? null : DateTime.makeUnsafe(expiresAt),
                  approvedAt: null,
                  email: "private@example.test",
                  userId: "user_01h455vb4pexka56gq5w2r7cpc",
                  credentialId: "tok_01h455vb4pexka56gq5w2r7cpc",
                  name: "private-credential-name",
                  scopes: ["extensions:read", "extensions:publish:version"],
                  model: "gat",
                })),
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
              "extensions:read",
              "extensions:publish:version",
              "gat",
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
                  credentialType: "pat",
                  authority: "limited",
                  permissions: { owners: ["@alice"], extensions: [], permission: "publish" },
                  resourceRestrictions: { extensions: ["@alice/skills/review"] },
                  expiresAt,
                  approvedAt: null,
                },
              });
            } else {
              for (const text of [
                "@alice",
                registry,
                "pat",
                "Publish versions",
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

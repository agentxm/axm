import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { AuthEnvironment } from "@agentxm/registry-access/adapters";
import {
  AuthClientTest,
  CredentialStoreTest,
  WorkloadCredentialsTest,
  DeviceLoginInteractionTest,
} from "@agentxm/registry-access/testing";
import { RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { AuthLoginPresenterLive } from "../../auth-login-presenter.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer, TestRenderer } from "../../test-support/presenter-test.js";
import { handleListTokens, TokenListDocumentSchema } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/list/reports-token-inventory",
  title: "Token listing reports Registry inventory and completeness",
  statement:
    "When token list succeeds, AXM shall report Registry token metadata, each token's permission level and allowlist in the public token vocabulary, and pagination state without token secrets or the Registry's internal permission model, request exactly one selected page with a default of 50 tokens, a limit of 1–100 and an optional cursor, offer a runnable human continuation preserving the Registry and limit for an incomplete page, and report every token exactly once when following returned cursors through a stable inventory.",
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
  it.effect("traverses a stable three-page inventory without omissions or duplicates", () => {
    const inventory = Array.from({ length: 5 }, (_, index) => ({
      id: `token-${index + 1}`,
      name: `automation-${index + 1}`,
      type: "pat",
      permissions: {
        model: "gat",
        owners: ["@alice"],
        extensions: [],
        permission: "read",
      },
      createdAt: expiry,
      expiresAt: expiry,
      lastUsedAt: null,
    }));
    const renderer = TestMachineRenderer.make();
    const requests: Array<{ readonly limit?: number; readonly cursor?: string } | undefined> = [];
    const ports = Layer.mergeAll(
      WorkloadCredentialsTest(),
      renderer.layer,
      TestFlagsLayer({ json: true }),
      Layer.succeed(RegistryUrl, registry),
      Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord({})),
      AuthClientTest({
        listTokens: (page) =>
          Effect.sync(() => {
            requests.push(page);
            const offset = page?.cursor === "after-2" ? 2 : page?.cursor === "after-4" ? 4 : 0;
            const next = offset + 2;
            return {
              tokens: inventory.slice(offset, next),
              hasMore: next < inventory.length,
              cursor: next < inventory.length ? `after-${next}` : null,
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
      DeviceLoginInteractionTest().layer,
    );
    return Effect.gen(function* () {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (const pageNumber of [0, 1, 2]) {
        yield* handleListTokens({ limit: 2, ...(cursor === undefined ? {} : { cursor }) });
        const document = Schema.encodeUnknownSync(TokenListDocumentSchema)(
          renderer.state.results.at(-1)?.data,
        );
        expect(document.hasMore).toBe(pageNumber < 2);
        expect(document.cursor).toBe(["after-2", "after-4", null][pageNumber]);
        expect(document.count).toBe(document.items.length);
        seen.push(...document.items.map(({ id }) => id));
        cursor = document.cursor ?? undefined;
      }
      expect(requests).toEqual([
        { limit: 2 },
        { limit: 2, cursor: "after-2" },
        { limit: 2, cursor: "after-4" },
      ]);
      expect(seen).toEqual(inventory.map(({ id }) => id));
      expect(new Set(seen).size).toBe(inventory.length);
      expect(renderer.state.results).toHaveLength(3);
    }).pipe(Effect.provide(Layer.provideMerge(AuthLoginPresenterLive, ports)));
  });

  for (const empty of [false, true])
    for (const machine of [false, true])
      for (const selected of [false, true]) {
        it.effect(
          `${empty ? "empty" : "partial"} ${machine ? "machine" : "human"} inventory with ${selected ? "selected" : "default"} page`,
          () => {
            const item = {
              id: "token-fixture",
              name: "automation",
              type: "pat",
              permissions: {
                model: "gat",
                owners: ["@alice"],
                extensions: [],
                permission: "read",
              },
              createdAt: expiry,
              expiresAt: expiry,
              lastUsedAt: null,
              token: "fixture-hidden-secret",
            };
            const renderer = machine ? TestMachineRenderer.make() : TestRenderer.make();
            const requests: Array<
              { readonly limit?: number; readonly cursor?: string } | undefined
            > = [];
            const ports = Layer.mergeAll(
              WorkloadCredentialsTest(),
              renderer.layer,
              TestFlagsLayer({ json: machine }),
              Layer.succeed(RegistryUrl, registry),
              Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord({})),
              AuthClientTest({
                listTokens: (page) =>
                  Effect.sync(() => {
                    requests.push(page);
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
              DeviceLoginInteractionTest().layer,
            );
            const layer = Layer.provideMerge(AuthLoginPresenterLive, ports);

            return Effect.gen(function* () {
              yield* handleListTokens(selected ? { limit: 7, cursor: "selected-page" } : {});
              expect(requests).toEqual([
                selected ? { limit: 7, cursor: "selected-page" } : { limit: 50 },
              ]);
              if (!machine) {
                expect(renderer.state.suggestions).toEqual(
                  empty
                    ? []
                    : [
                        {
                          description: "List the next page of tokens",
                          cmd: `axm token list --registry ${registry} --limit ${selected ? 7 : 50} --cursor next-page`,
                        },
                      ],
                );
              }

              const output = renderer.state.results;
              expect(output).toHaveLength(1);
              expect(
                Schema.encodeUnknownSync(TokenListDocumentSchema)(output[0]?.data),
              ).toMatchObject({
                items: empty
                  ? []
                  : [
                      {
                        id: item.id,
                        name: item.name,
                        // The public vocabulary only: the Registry's internal
                        // permission model stays out of the document.
                        permissions: { owners: ["@alice"], extensions: [], permission: "read" },
                        lastUsedAt: null,
                      },
                    ],
                count: empty ? 0 : 1,
                hasMore: !empty,
                cursor: empty ? null : "next-page",
              });
              expect(JSON.stringify(output)).not.toContain('"model"');
              expect(JSON.stringify(output)).not.toContain("fixture-hidden-secret");
              expect(JSON.stringify(output)).not.toContain("fixture-stored-access");
            }).pipe(Effect.provide(layer));
          },
        );
      }
});

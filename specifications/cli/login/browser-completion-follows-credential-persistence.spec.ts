import { describe, expect, it } from "@effect/vitest";
import * as NodeHttp from "node:http";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import {
  CredentialStore,
  RegistryAuthFailed,
  runLoopbackLogin,
} from "axm.sh/specification-harness";
import {
  AuthClientTest,
  AuthLoginPresenterTest,
  DeviceLoginInteractionTest,
} from "@agentxm/registry-auth/testing";

export const specification = defineSpecification({
  requirement: "cli/login/browser-completion-follows-credential-persistence",
  title: "Browser sign-in completion follows saved credentials",
  statement:
    "For loopback sign-in, AXM shall report browser completion only after issuer validation, successful code exchange, and credential persistence, reporting callback receipt while finishing and terminal recovery on failure.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The examples observe the streamed response from the real loopback HTTP listener while exchange and credential storage are controlled through their services.",
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/loopback-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The HTTP evidence does not establish visual rendering or a real identity-provider round trip.",
      retirementCondition:
        "Record browser verification of the provider, callback, and terminal result.",
    },
  ],
});

describe("Truthful browser sign-in completion", () => {
  for (const failure of ["none", "issuer", "exchange", "persistence"] as const) {
    it.effect(`reports the actual outcome when failure is ${failure}`, () =>
      Effect.gen(function* () {
        const browserUrl = yield* Deferred.make<string>();
        const firstChunk = yield* Deferred.make<string>();
        const allowPersistence = yield* Deferred.make<void>();
        const registry = "https://registry.agentxm.ai";
        const presenter = AuthLoginPresenterTest();
        const writes: string[] = [];
        const failureEffect = Effect.fail(
          new RegistryAuthFailed({ category: "auth", detail: "Fixture failure" }),
        );
        const layer = Layer.mergeAll(
          presenter.layer,
          DeviceLoginInteractionTest({
            openBrowser: (url) => Deferred.succeed(browserUrl, url).pipe(Effect.as(true)),
          }).layer,
          AuthClientTest({
            buildAuthorizeUrl: ({ redirectUri, state }) => {
              const callback = new URL(redirectUri);
              callback.searchParams.set("state", state);
              callback.searchParams.set("code", "fixture-code");
              callback.searchParams.set(
                "iss",
                failure === "issuer" ? "https://wrong.example" : "https://agentxm.ai",
              );
              return callback.href;
            },
            exchangePkceCode: () =>
              Deferred.await(firstChunk).pipe(
                Effect.andThen(
                  failure === "exchange"
                    ? failureEffect
                    : Effect.succeed({
                        access_token: "fixture-access",
                        refresh_token: "fixture-refresh",
                        expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                      }),
                ),
              ),
            getMe: () =>
              Effect.succeed({
                userHandle: normalizeHandle("@alice"),
                tokenType: "session",
                scopes: [],
                resourceRestrictions: { extensions: null },
                expiresAt: null,
              }),
          }),
          Layer.succeed(CredentialStore, {
            tier: "restricted-file",
            allowsPersistedCredentials: true,
            load: () => Effect.succeed(Option.none()),
            clear: () => Effect.void,
            save: (_registry, _handle, credentials) =>
              Deferred.await(allowPersistence).pipe(
                Effect.andThen(
                  failure === "persistence"
                    ? failureEffect
                    : Effect.sync(() => {
                        writes.push(credentials.access_token);
                      }),
                ),
              ),
          }),
        );
        const login = yield* runLoopbackLogin(registry).pipe(
          Effect.provide(layer),
          Effect.exit,
          Effect.forkChild,
        );
        const url = yield* Deferred.await(browserUrl);
        const response = yield* Effect.callback<string, Error>((resume) => {
          const outgoing = NodeHttp.get(url, (incoming) => {
            const chunks: string[] = [];
            incoming.setEncoding("utf8");
            incoming.on("data", (chunk: string) => {
              chunks.push(chunk);
              Deferred.doneUnsafe(firstChunk, Effect.succeed(chunks.join("")));
            });
            incoming.on("end", () => resume(Effect.succeed(chunks.join(""))));
            incoming.on("error", (error) => resume(Effect.fail(error)));
          });
          outgoing.on("error", (error) => resume(Effect.fail(error)));
          return Effect.sync(() => {
            outgoing.destroy();
          });
        }).pipe(Effect.forkChild);
        const receipt = yield* Deferred.await(firstChunk);
        expect(receipt).toContain("Callback received");
        expect(receipt).not.toContain("You’re signed in");
        expect(writes).toEqual([]);
        yield* Deferred.succeed(allowPersistence, undefined);
        const result = yield* Fiber.join(login);
        const html = yield* Fiber.join(response);
        expect(html).not.toContain("fixture-access");
        expect(html).not.toContain("fixture-code");
        if (failure === "none") {
          expect(result._tag).toBe("Success");
          expect(writes).toEqual(["fixture-access"]);
          expect(html).toContain("Your credentials have been saved");
        } else {
          expect(result._tag).toBe("Failure");
          expect(writes).toEqual([]);
          expect(html).not.toContain("You’re signed in");
          expect(html).toContain("Return to your terminal for details and recovery instructions");
        }
      }),
    );
  }
});

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import { RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { TokenExchangeTest } from "../authentication/auth-client.js";
import {
  CredentialStoreSessionLive,
  CredentialStoreTest,
} from "../credentials/credential-store.js";
import { SessionRefresherLive } from "../credentials/session-refresh.js";
import { makeAuthMiddlewareLive } from "./auth-middleware.js";

export const specification = defineSpecification({
  requirement: "cli/reads-carry-the-invocations-credential",
  title: "A read carries the credential the invocation holds",
  statement:
    "When an invocation reads from a Registry, AXM shall present the credential it holds — so a signed-in person sees what their permissions allow, including their own private extensions — shall read anonymously when it holds none rather than refusing, and shall leave a credential the caller set on the request exactly as the caller set it.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/adapters/auth-middleware.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");

const signedIn = {
  version: 1 as const,
  registries: {
    [registry]: {
      accounts: {
        [handle]: {
          access_token: "stored-access",
          refresh_token: "stored-refresh",
          expires_at: DateTime.makeUnsafe("1970-01-01T01:00:00.000Z"),
          active: true,
        },
      },
    },
  },
};

const readWith = (credentials?: typeof signedIn) => {
  let presented: string | undefined;
  const transport = HttpClient.make((request) =>
    Effect.sync(() => {
      const header = request.headers["authorization"];
      presented = typeof header === "string" ? header : undefined;
      return HttpClientResponse.fromWeb(request, new Response("{}", { status: 200 }));
    }),
  );
  const transportLayer = Layer.succeed(HttpClient.HttpClient, transport);
  const store = Layer.provide(
    CredentialStoreSessionLive,
    CredentialStoreTest("restricted-file", credentials),
  );
  const layer = Layer.provide(
    makeAuthMiddlewareLive(),
    Layer.mergeAll(
      transportLayer,
      store,
      Layer.provide(SessionRefresherLive, Layer.merge(TokenExchangeTest(), store)),
      Layer.succeed(RegistryUrl, registry),
    ),
  );
  return { layer, read: () => presented };
};

const get = (
  build?: (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const base = HttpClientRequest.get(`${registry}/v1/extensions/@alice/skills/private`);
    return yield* client.execute(build === undefined ? base : build(base));
  });

describe("Reads carry the invocation's credential", () => {
  it.effect("presents the stored session on an ordinary read", () =>
    Effect.gen(function* () {
      const { layer, read } = readWith(signedIn);
      yield* get().pipe(Effect.provide(layer));
      expect(read()).toBe("Bearer stored-access");
    }),
  );

  it.effect("reads anonymously when the invocation holds no credential", () =>
    Effect.gen(function* () {
      const { layer, read } = readWith();
      const response = yield* get().pipe(Effect.provide(layer));
      expect(response.status).toBe(200);
      expect(read()).toBeUndefined();
    }),
  );

  it.effect("leaves a credential the caller set on the request alone", () =>
    Effect.gen(function* () {
      const { layer, read } = readWith(signedIn);
      yield* get((request) => HttpClientRequest.bearerToken(request, "caller-chosen")).pipe(
        Effect.provide(layer),
      );
      expect(read()).toBe("Bearer caller-chosen");
    }),
  );
});

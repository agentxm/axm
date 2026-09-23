import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { credentialFileFixture } from "../credentials/test-helpers.js";
import { RegistryRequestFailed, RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { TokenExchangeTest } from "../authentication/auth-client.js";
import { RegistryAccessFailed } from "../authentication/errors.js";
import {
  CredentialStore,
  CredentialStoreSessionLive,
  CredentialStoreTest,
} from "../credentials/credential-store.js";
import { SessionRefresherLive } from "../credentials/session-refresh.js";
import { AuthMiddlewareLive } from "./auth-middleware.js";
import { AuthEnvironment } from "./environment.js";

export const specification = defineSpecification({
  requirement: "cli/reads-carry-the-invocations-credential",
  title: "A read carries the credential the invocation holds",
  statement:
    "When an invocation reads from a Registry, AXM shall present the credential it holds — so a signed-in person sees what their permissions allow, including their own private extensions — shall read anonymously when it holds none rather than refusing, shall fail the read with the reason, sending nothing, when a credential source it was pointed at — configuration, a token file, or the credential store — cannot be read or decoded, shall treat a read the Registry rejects for its credential exactly as a rejected write — renewing a stored session once and retrying, and otherwise keeping the rejection rather than reading anonymously — and shall leave a credential the caller set on the request exactly as the caller set it.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The live credential adapter reads real isolated files so malformed and unreadable persisted credentials cannot become anonymous requests.",
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
    AuthMiddlewareLive,
    Layer.mergeAll(
      transportLayer,
      store,
      Layer.provide(SessionRefresherLive, Layer.merge(TokenExchangeTest(), store)),
      Layer.succeed(RegistryUrl, registry),
    ),
  );
  return { layer, read: () => presented };
};

/** A Registry that answers 401 to every credential but `accepted`. */
const rejectingReadsOf = (options: {
  readonly accepted: string;
  readonly presented: Array<string | undefined>;
  readonly credentials?: typeof signedIn;
  readonly environment?: Record<string, string>;
  readonly provider?: ConfigProvider.ConfigProvider;
  /** Replaces the credential store's read. */
  readonly load?: CredentialStore["Service"]["load"];
}) => {
  const transport = HttpClient.make((request) =>
    Effect.sync(() => {
      const header = request.headers["authorization"];
      options.presented.push(typeof header === "string" ? header : undefined);
      return HttpClientResponse.fromWeb(
        request,
        header === options.accepted
          ? new Response("{}", { status: 200 })
          : new Response("unauthorized", { status: 401 }),
      );
    }),
  );
  const home = CredentialStoreTest("restricted-file", options.credentials);
  const load = options.load;
  const store = Layer.provide(
    CredentialStoreSessionLive,
    load === undefined
      ? home
      : Layer.effect(
          CredentialStore,
          Effect.map(CredentialStore, (service) => ({ ...service, load, reload: load })),
        ).pipe(Layer.provide(home)),
  );
  const exchange = TokenExchangeTest({
    refreshToken: () =>
      Effect.succeed({
        access_token: "renewed-access",
        refresh_token: "renewed-refresh",
        expires_at: DateTime.makeUnsafe("1970-01-01T02:00:00.000Z"),
      }),
  });
  // The environment is read when a request resolves its credential, so it is
  // provided to the reader, not only to the transport's construction.
  return Layer.merge(
    Layer.provide(
      AuthMiddlewareLive,
      Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient, transport),
        store,
        Layer.provide(SessionRefresherLive, Layer.merge(exchange, store)),
        Layer.succeed(RegistryUrl, registry),
        NodeServices.layer,
      ),
    ),
    Layer.succeed(
      AuthEnvironment,
      options.provider ?? ConfigProvider.fromEnvRecord(options.environment ?? {}),
    ),
  );
};

/** The typed failure a transport failure carries, or undefined. */
const carriedBy = (failure: HttpClientError.HttpClientError | RegistryAccessFailed) =>
  failure._tag === "HttpClientError" &&
  failure.reason._tag === "TransportError" &&
  failure.reason.cause instanceof RegistryRequestFailed
    ? failure.reason.cause
    : undefined;

const get = (
  build?: (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const base = HttpClientRequest.get(`${registry}/v1/extensions/@alice/skills/private`);
    return yield* client.execute(build === undefined ? base : build(base));
  });

describe("Reads carry the invocation's credential", () => {
  for (const content of ["{", '{"version":1,"registries":false}']) {
    it.live("sends nothing for an invalid persisted credential: " + content, () =>
      Effect.gen(function* () {
        const fixture = yield* credentialFileFixture;
        yield* fixture.fs.writeFileString(fixture.file, content, { mode: 0o600 });
        const presented: string[] = [];
        const transport = HttpClient.make((request) =>
          Effect.sync(() => {
            presented.push(request.url);
            return HttpClientResponse.fromWeb(request, new Response("{}"));
          }),
        );
        const store = fixture.layer;
        const layer = AuthMiddlewareLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(HttpClient.HttpClient, transport),
              store,
              SessionRefresherLive.pipe(Layer.provide(Layer.merge(TokenExchangeTest(), store))),
              Layer.succeed(RegistryUrl, registry),
            ),
          ),
        );
        const failure = yield* get().pipe(
          Effect.provide(layer),
          Effect.provideService(AuthEnvironment, fixture.environment),
          Effect.flip,
        );
        expect(carriedBy(failure)).toMatchObject({
          category: "auth",
          detail: "Failed to parse credential file",
        });
        expect(presented).toEqual([]);
        expect(yield* fixture.fs.readFileString(fixture.file)).toBe(content);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }

  for (const source of ["AXM_TOKEN", "AXM_TOKEN_FILE"]) {
    it.effect("sends nothing when the configured " + source + " source fails", () =>
      Effect.gen(function* () {
        const presented: Array<string | undefined> = [];
        const layer = rejectingReadsOf({
          accepted: "Bearer stored-access",
          presented,
          credentials: signedIn,
          provider: ConfigProvider.make((path) =>
            path[0] === source
              ? Effect.fail(new ConfigProvider.SourceError({ message: "source unavailable" }))
              : Effect.succeed(undefined),
          ),
        });
        const failure = yield* get().pipe(Effect.provide(layer), Effect.flip);
        expect(carriedBy(failure)).toMatchObject({
          category: "auth",
          detail: `Could not read authentication configuration: ${source}`,
        });
        expect(presented).toEqual([]);
      }),
    );
  }

  for (const operation of ["readFileString", "stat", "missing"] as const) {
    it.live("distinguishes a missing live credential file from " + operation, () =>
      Effect.gen(function* () {
        const fixture = yield* credentialFileFixture;
        if (operation !== "missing")
          yield* fixture.fs.writeFileString(fixture.file, '{"version":1,"registries":{}}', {
            mode: 0o600,
          });
        const denied = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: operation,
          pathOrDescriptor: fixture.file,
        });
        const failedFs: FileSystem.FileSystem = {
          ...fixture.fs,
          readFileString: (path, ...options) =>
            operation === "readFileString" && path === fixture.file
              ? Effect.fail(denied)
              : fixture.fs.readFileString(path, ...options),
          stat: (path) =>
            operation === "stat" && path === fixture.file
              ? Effect.fail(denied)
              : fixture.fs.stat(path),
        };
        const presented: Array<string | undefined> = [];
        const transport = HttpClient.make((request) =>
          Effect.sync(() => {
            presented.push(request.headers["authorization"]);
            return HttpClientResponse.fromWeb(request, new Response("{}"));
          }),
        );
        const store = fixture.layer.pipe(
          Layer.provide(Layer.succeed(FileSystem.FileSystem, failedFs)),
        );
        const layer = AuthMiddlewareLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(HttpClient.HttpClient, transport),
              store,
              SessionRefresherLive.pipe(Layer.provide(Layer.merge(TokenExchangeTest(), store))),
              Layer.succeed(RegistryUrl, registry),
            ),
          ),
        );
        const request = get().pipe(
          Effect.provide(layer),
          Effect.provideService(AuthEnvironment, fixture.environment),
        );
        if (operation === "missing") {
          expect((yield* request).status).toBe(200);
          expect(presented).toEqual([undefined]);
        } else {
          expect(carriedBy(yield* Effect.flip(request))).toMatchObject({
            category: "auth",
            cause: { cause: denied },
          });
          expect(presented).toEqual([]);
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }

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

  // The Registry answers a credential it cannot resolve with 401 on a read
  // too, rather than serving the read as if nobody had asked.
  it.effect("renews a stored session once when a read is rejected, and retries", () =>
    Effect.gen(function* () {
      const presented: Array<string | undefined> = [];
      const layer = rejectingReadsOf({
        accepted: "Bearer renewed-access",
        presented,
        credentials: signedIn,
      });
      const response = yield* get().pipe(Effect.provide(layer));
      expect(response.status).toBe(200);
      expect(presented).toEqual(["Bearer stored-access", "Bearer renewed-access"]);
    }),
  );

  it.effect("keeps the rejection of an ambient credential instead of reading anonymously", () =>
    Effect.gen(function* () {
      const presented: Array<string | undefined> = [];
      const layer = rejectingReadsOf({
        accepted: "Bearer nothing-the-invocation-holds",
        presented,
        environment: { AXM_TOKEN: "ambient-unresolvable" },
      });
      const response = yield* get().pipe(Effect.provide(layer));
      expect(response.status).toBe(401);
      expect(presented).toEqual(["Bearer ambient-unresolvable"]);
    }),
  );

  // Sent without its credential, either read would be answered as if the
  // person were nobody: their private extension would simply not exist.
  it.effect("fails the read, sending nothing, when its token file cannot be read", () =>
    Effect.gen(function* () {
      const presented: Array<string | undefined> = [];
      const layer = rejectingReadsOf({
        accepted: "Bearer never-presented",
        presented,
        credentials: signedIn,
        environment: { AXM_TOKEN_FILE: "/nonexistent/axm-token-file" },
      });
      const failure = yield* get().pipe(Effect.provide(layer), Effect.flip);
      expect(carriedBy(failure)).toMatchObject({
        category: "auth",
        detail: "Could not read AXM_TOKEN_FILE at /nonexistent/axm-token-file.",
      });
      expect(presented).toEqual([]);
    }),
  );

  it.effect("fails the read, sending nothing, when the credential store cannot be read", () =>
    Effect.gen(function* () {
      const presented: Array<string | undefined> = [];
      const layer = rejectingReadsOf({
        accepted: "Bearer never-presented",
        presented,
        load: () =>
          Effect.fail(
            new RegistryAccessFailed({
              category: "auth",
              detail: "Credential file could not be read",
            }),
          ),
      });
      const failure = yield* get().pipe(Effect.provide(layer), Effect.flip);
      expect(carriedBy(failure)).toMatchObject({
        category: "auth",
        detail: "Credential file could not be read",
      });
      expect(presented).toEqual([]);
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

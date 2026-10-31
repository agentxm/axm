import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { computeIntegrity } from "@agentxm/host-primitives";
import { exactVersion } from "./test-helpers.js";

import { RegistryClientFactory, RegistryClientFactoryLive } from "./registry-client-factory.js";
import { RegistryHttpClient, RegistryRequestAuthorization } from "./registry-transport.js";

const fileEndpoint = (directory: string) =>
  decodeRegistryEndpointSync(pathToFileURL(directory).href);

const recorded = (status = 200, headers: Record<string, string> = {}) => {
  const requests: Array<{ readonly url: string; readonly authorization: string | undefined }> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push({ url: request.url, authorization: request.headers["authorization"] });
      return HttpClientResponse.fromWeb(
        request,
        new Response(status >= 300 && status < 400 ? null : "{}", { status, headers }),
      );
    }),
  );
  return { requests, client };
};

/** Like the real authorization, it supplies a credential and never replaces one. */
const presentingToken = Layer.succeed(RegistryRequestAuthorization, {
  authorize: (_endpoint, client) =>
    client.pipe(
      HttpClient.mapRequest((request) =>
        request.headers["authorization"] === undefined
          ? HttpClientRequest.bearerToken(request, "synthetic-token")
          : request,
      ),
    ),
});

const factoryLayer = (client: HttpClient.HttpClient) =>
  Layer.provide(
    RegistryClientFactoryLive,
    Layer.mergeAll(NodeServices.layer, Layer.succeed(RegistryHttpClient, client), presentingToken),
  );

describe("RegistryClientFactory", () => {
  it.effect("retains cache configuration failure without disabling unrelated transports", () =>
    Effect.gen(function* () {
      const sourceError = new ConfigProvider.SourceError({ message: "cache source unavailable" });
      let reads = 0;
      const config = ConfigProvider.make((path) => {
        if (path[0] !== "XDG_CACHE_HOME") return Effect.succeed(undefined);
        reads += 1;
        return Effect.fail(sourceError);
      });
      yield* Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const file = yield* factory.forEndpoint(decodeRegistryEndpointSync("file:///registry"));
        expect(file).toBeDefined();
        const endpoint = decodeRegistryEndpointSync("https://registry.example.test");
        expect(yield* factory.lifecycle(endpoint, "Deprecating")).toBeDefined();
        expect(yield* factory.wire(endpoint, { operation: "Signing in" })).toBeDefined();
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const failure = yield* factory.forEndpoint(endpoint).pipe(Effect.flip);
          expect(failure.cause).toBe(sourceError);
        }
        expect(reads).toBe(1);
      }).pipe(
        Effect.provide(
          factoryLayer(recorded().client).pipe(Layer.provide(ConfigProvider.layer(config))),
        ),
      );
    }),
  );

  it.effect("shares an active archive acquisition across clients from one factory", () => {
    const root = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-factory-"));
    return Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const archive = new Uint8Array([1, 2, 3]);
      const integrity = yield* computeIntegrity(archive);
      const requests: string[] = [];
      const transport = HttpClient.make((request) =>
        Effect.gen(function* () {
          requests.push(request.method);
          yield* Deferred.succeed(started, undefined);
          yield* Deferred.await(release);
          return HttpClientResponse.fromWeb(request, new Response(archive));
        }),
      );
      const acquisition = Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const endpoint = decodeRegistryEndpointSync("https://registry.example.test");
        const firstClient = yield* factory.forEndpoint(endpoint);
        const secondClient = yield* factory.forEndpoint(endpoint);
        const args = {
          owner: decodeHandleSync("@acme"),
          type: "skill" as const,
          name: decodeExtensionNameSync("shared"),
          exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "hbnd_test" },
        };
        const first = yield* firstClient.getExtensionPackage(args).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const second = yield* secondClient.getExtensionPackage(args).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Deferred.succeed(release, undefined);
        expect((yield* Fiber.join(first)).archive).toEqual(archive);
        expect((yield* Fiber.join(second)).archive).toEqual(archive);
        expect(requests).toEqual(["GET"]);
      });
      yield* acquisition.pipe(
        Effect.provide(
          factoryLayer(transport).pipe(
            Layer.provide(
              ConfigProvider.layer(ConfigProvider.fromUnknown({ AXM_USER_HOME: root })),
            ),
          ),
        ),
      );
    }).pipe(Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true }))));
  });

  it.effect("names the directory a percent-encoded file: URL decodes to", () => {
    const root = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-factory-"));
    const namedRoot = nodePath.join(root, "my registry");
    mkdirSync(nodePath.join(namedRoot, "extensions", "@acme"), { recursive: true });
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const client = yield* factory.forEndpoint(fileEndpoint(namedRoot));
      expect((yield* client.ownerExists(decodeHandleSync("@acme"))).exists).toBe(true);
      const index = yield* client.getExtensionIndex({
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("absent"),
      });
      expect(Option.isNone(index)).toBe(true);
    }).pipe(
      Effect.provide(factoryLayer(recorded().client)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true }))),
    );
  });

  it.effect("refuses file lifecycle and authentication before touching anything", () => {
    const root = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-factory-"));
    const transport = recorded();
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const lifecycle = yield* factory
        .lifecycle(fileEndpoint(root), "Deprecating")
        .pipe(Effect.flip);
      expect(lifecycle).toMatchObject({
        _tag: "RegistryOperationUnsupported",
        category: "validation",
        operation: "Deprecating",
        transport: "file",
      });
      const wire = yield* factory
        .wire(fileEndpoint(root), { operation: "Signing in" })
        .pipe(Effect.flip);
      expect(wire._tag).toBe("RegistryOperationUnsupported");
      expect(transport.requests).toEqual([]);
    }).pipe(
      Effect.provide(factoryLayer(transport.client)),
      Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true }))),
    );
  });

  it.effect("presents the credential only at the Registry origin", () => {
    const transport = recorded();
    const endpoint = decodeRegistryEndpointSync("https://registry.example.test/");
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const { httpClient } = yield* factory.wire(endpoint, { operation: "Reading identity" });
      yield* httpClient.get("https://registry.example.test/v1/me");
      const elsewhere = yield* httpClient
        .get("https://elsewhere.example.test/v1/me")
        .pipe(Effect.flip);
      expect(elsewhere.reason._tag).toBe("TransportError");
      expect(transport.requests).toEqual([
        { url: "https://registry.example.test/v1/me", authorization: "Bearer synthetic-token" },
      ]);
    }).pipe(Effect.provide(factoryLayer(transport.client)));
  });

  it.effect("refuses a credential the caller set when it is addressed to another origin", () => {
    const transport = recorded();
    const endpoint = decodeRegistryEndpointSync("https://registry.example.test");
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const { httpClient } = yield* factory.wire(endpoint, {
        operation: "Reading the signed-in identity",
      });
      const refused = yield* httpClient
        .execute(
          HttpClientRequest.get("https://elsewhere.example.test/v1/me").pipe(
            HttpClientRequest.bearerToken("just-issued-token"),
          ),
        )
        .pipe(Effect.flip);
      expect(refused.reason._tag).toBe("TransportError");
      // A caller-named credential stays as the caller set it at its own origin.
      yield* httpClient.execute(
        HttpClientRequest.get("https://registry.example.test/v1/me").pipe(
          HttpClientRequest.bearerToken("just-issued-token"),
        ),
      );
      expect(transport.requests).toEqual([
        { url: "https://registry.example.test/v1/me", authorization: "Bearer just-issued-token" },
      ]);
    }).pipe(Effect.provide(factoryLayer(transport.client)));
  });

  it.effect("refuses a redirect instead of following it", () => {
    const transport = recorded(302, { location: "https://elsewhere.example.test/v1/me" });
    const endpoint = decodeRegistryEndpointSync("https://registry.example.test");
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const { httpClient } = yield* factory.wire(endpoint, { operation: "Reading identity" });
      const refused = yield* httpClient
        .get("https://registry.example.test/v1/me")
        .pipe(Effect.flip);
      expect(refused.reason._tag).toBe("TransportError");
      expect(refused.message).toContain("https://elsewhere.example.test");
      expect(transport.requests).toHaveLength(1);
    }).pipe(Effect.provide(factoryLayer(transport.client)));
  });

  it.effect("passes a not-modified answer through rather than refusing it as a redirect", () => {
    const transport = recorded(304);
    const endpoint = decodeRegistryEndpointSync("https://registry.example.test");
    return Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const { httpClient } = yield* factory.wire(endpoint, { operation: "Reading identity" });
      const answer = yield* httpClient.get("https://registry.example.test/v1/me");
      expect(answer.status).toBe(304);
    }).pipe(Effect.provide(factoryLayer(transport.client)));
  });
});

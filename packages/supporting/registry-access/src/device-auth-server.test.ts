import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Exit from "effect/Exit";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { AuthClient } from "./authentication/index.js";
import { authClientOver } from "./authentication/test-support/test-helpers.js";
import { startDeviceAuthServer } from "@agentxm/test-support/auth-server";

// The real loopback HTTP and generated decoders validate the fixture protocol.
// Synthetic grants stand in for the Registry's authorization policy, not its implementation.
it.live("shares deterministic sign-in and token CRUD with an independent request oracle", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(startDeviceAuthServer("approved"), (value) =>
      value.close.pipe(Effect.orDie),
    );
    const endpoint = decodeHttpRegistryEndpointSync(server.url);
    const wire = yield* HttpClient.HttpClient;
    const unauthorized = yield* wire.get(server.url + "/v1/auth/me");
    expect(unauthorized.status).toBe(401);
    const transport = wire.pipe(
      HttpClient.mapRequest(HttpClientRequest.setHeader("authorization", "Bearer axm_ses_e2e")),
    );
    const initial = server.snapshot();
    const exercise = Effect.gen(function* () {
      const auth = yield* AuthClient;
      const device = yield* auth.initiateDeviceFlow(endpoint);
      expect(device.verification_uri).toBe(server.url + "/device");
      const token = yield* auth.pollDeviceToken(endpoint, device.device_code, 0);
      expect(token.access_token).toBe("axm_ses_e2e");
      const identity = yield* auth.getMe(endpoint, token.access_token);
      expect(identity.userHandle).toBe("@alice");
      expect((yield* auth.listTokens(endpoint)).tokens.map((item) => item.id)).toEqual([
        server.seededTokenId,
      ]);
      const created = yield* auth.createToken(endpoint, {
        name: "fixture-created-token",
        permissions: { permission: "read", owners: ["@alice"] },
        expiresIn: 3600,
      });
      expect(DateTime.formatIso(created.expiresAt)).toBe("2099-01-01T00:00:00.000Z");
      expect((yield* auth.listTokens(endpoint)).tokens.map((item) => item.id)).toEqual([
        created.id,
        server.seededTokenId,
      ]);
      yield* auth.deleteToken(endpoint, server.seededTokenId);
      expect((yield* auth.listTokens(endpoint)).tokens.map((item) => item.id)).toEqual([
        created.id,
      ]);
      return created;
    }).pipe(Effect.provide(authClientOver(transport)));
    const created = yield* exercise;
    expect(server.snapshot().tokens.map((item) => item.id)).toEqual([created.id]);
    const records = server.requests();
    expect(records.map(({ method, pathname, status }) => [method, pathname, status])).toEqual([
      ["GET", "/v1/auth/me", 401],
      ["POST", "/v1/auth/device/code", 200],
      ["POST", "/v1/auth/token", 200],
      ["GET", "/v1/auth/me", 200],
      ["GET", "/v1/tokens", 200],
      ["POST", "/v1/tokens", 201],
      ["GET", "/v1/tokens", 200],
      ["DELETE", "/v1/tokens/" + server.seededTokenId, 204],
      ["GET", "/v1/tokens", 200],
    ]);
    const createdResponse = {
      id: created.id,
      name: created.name,
      type: "pat",
      permissions: created.permissions,
      createdAt: DateTime.formatIso(created.createdAt),
      expiresAt: DateTime.formatIso(created.expiresAt),
      lastUsedAt: null,
      token: created.token,
    };
    expect(records.find((request) => request.status === 201)?.responseBytes).toBe(
      Buffer.byteLength(JSON.stringify(createdResponse)),
    );
    expect(JSON.stringify(records)).not.toContain("axm_ses_e2e");
    expect(JSON.stringify(records)).not.toContain("fixture-created-token");
    server.setOutcome("denied");
    yield* server.reset;
    expect(server.snapshot()).toEqual(initial);
    expect(server.requests()).toEqual([]);
    expect(yield* exercise).toEqual(created);
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
);

it.live.each(["denied", "expired"] as const)("preserves the %s device outcome", (outcome) =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(startDeviceAuthServer(outcome), (value) =>
      value.close.pipe(Effect.orDie),
    );
    const wire = yield* HttpClient.HttpClient;
    const result = yield* Effect.flatMap(AuthClient, (auth) =>
      auth.pollDeviceToken(decodeHttpRegistryEndpointSync(server.url), "device-secret", 0),
    ).pipe(Effect.provide(authClientOver(wire)), Effect.exit);
    expect(Exit.isFailure(result)).toBe(true);
    expect(server.requests().map((request) => request.status)).toEqual([400]);
  }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
);

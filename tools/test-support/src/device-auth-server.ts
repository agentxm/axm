/** A standalone loopback protocol fixture for process tests and development benchmarks. */
import * as http from "node:http";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

type DeviceOutcome = "approved" | "denied" | "expired" | "pending";

export class DeviceAuthServerError extends Data.TaggedError("DeviceAuthServerError")<{
  readonly operation: "listen" | "close";
  readonly cause: unknown;
}> {}

export interface DeviceAuthRequest {
  readonly method: string;
  readonly pathname: string;
  readonly status: number;
  readonly requestBytes: number;
  readonly responseBytes: number;
}

const createdAt = "2026-01-01T00:00:00.000Z";
const expiresAt = "2099-01-01T00:00:00.000Z";
const sessionToken = "axm_ses_e2e";
const seededTokenId = "tok_01h455vb4pexka56gq5w2r7cpc";
// This deliberately bounded protocol fixture stays independent of production
// decoders. Registry-access tests exercise those decoders against its real HTTP.
const permission = Schema.Literals(["read", "publish", "admin"]);
const FixtureCreateTokenRequest = Schema.Struct({
  name: Schema.String,
  permissions: Schema.Struct({
    permission,
    owners: Schema.optional(Schema.Array(Schema.String)),
    extensions: Schema.optional(Schema.Array(Schema.String)),
  }),
  expiresIn: Schema.optional(Schema.Number),
});
const FixtureToken = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  permissions: Schema.Struct({
    permission,
    owners: Schema.Array(Schema.String),
    extensions: Schema.Array(Schema.String),
  }),
  createdAt: Schema.String,
  expiresAt: Schema.String,
  lastUsedAt: Schema.Null,
});
const seededToken = Schema.decodeUnknownSync(FixtureToken)({
  id: seededTokenId,
  name: "fixture-seeded-token",
  type: "pat",
  permissions: { permission: "read", owners: ["@alice"], extensions: [] },
  createdAt,
  expiresAt,
  lastUsedAt: null,
});

export const startDeviceAuthServer = (initialOutcome: DeviceOutcome = "pending") =>
  Effect.gen(function* () {
    let outcome = initialOutcome;
    let sequence = 0;
    let tokens: Array<typeof FixtureToken.Type> = [seededToken];
    const requests: DeviceAuthRequest[] = [];
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      let requestBytes = 0;
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        requestBytes += Buffer.byteLength(chunk);
        // This is a bounded fixture, not an alternate production auth server.
        if (requestBytes <= 64 * 1024) body += chunk;
      });
      request.on("end", () => {
        const sendJson = (status: number, value?: unknown) => {
          const encoded = value === undefined ? "" : JSON.stringify(value);
          requests.push({
            method: request.method ?? "GET",
            pathname,
            status,
            requestBytes,
            responseBytes: Buffer.byteLength(encoded),
          });
          response.writeHead(status, { "content-type": "application/json" });
          response.end(encoded);
        };
        if (requestBytes > 64 * 1024) {
          sendJson(413, { error: "fixture_body_limit" });
          return;
        }
        if (request.method === "POST" && pathname === "/v1/auth/device/code") {
          const address = server.address();
          if (address === null || typeof address === "string") {
            sendJson(500, { error: "server_address_unavailable" });
            return;
          }
          const verificationUri = `http://127.0.0.1:${address.port}/device`;
          sendJson(200, {
            device_code: "device-secret",
            user_code: "ABCD-1234",
            verification_uri: verificationUri,
            verification_uri_complete: `${verificationUri}?user_code=ABCD-1234`,
            interval: 1,
            expires_in: 900,
          });
          return;
        }
        if (request.method === "POST" && pathname === "/v1/auth/token") {
          if (outcome === "approved") {
            sendJson(200, {
              access_token: sessionToken,
              refresh_token: "axm_ref_e2e",
              token_type: "Bearer",
              expires_in: 3600,
              expires_at: expiresAt,
            });
          } else {
            const error =
              outcome === "denied"
                ? "access_denied"
                : outcome === "expired"
                  ? "expired_token"
                  : "authorization_pending";
            sendJson(400, { kind: "TokenOAuthError", error, error_description: error });
          }
          return;
        }
        if (request.method === "POST" && pathname === "/v1/auth/revoke") {
          sendJson(200, {});
          return;
        }
        if (request.headers.authorization !== `Bearer ${sessionToken}`) {
          sendJson(401, {
            type: "https://registry.agentxm.ai/v1/problems/unauthorized",
            code: "unauthorized",
            status: 401,
            title: "Unauthorized",
          });
          return;
        }
        if (request.method === "GET" && pathname === "/v1/auth/me") {
          sendJson(200, {
            user: {
              id: "user_01h455vb4pexka56gq5w2r7cpc",
              handle: "@alice",
              email: "alice@example.com",
            },
            token: {
              id: "tok_01h455vb4pexka56gq5w2r7cpc",
              type: "session",
              name: null,
              prefix: null,
              permissions: null,
              authority: "account",
              expiresAt,
              approvedAt: createdAt,
              trustedPublisher: null,
            },
          });
          return;
        }
        if (request.method === "GET" && pathname === "/v1/tokens") {
          sendJson(200, { tokens, cursor: null, hasMore: false });
          return;
        }
        if (request.method === "POST" && pathname === "/v1/tokens") {
          const decoded = Schema.decodeUnknownExit(
            Schema.fromJsonString(FixtureCreateTokenRequest),
          )(body);
          if (Exit.isFailure(decoded)) {
            sendJson(400, { error: "invalid_fixture_token_request" });
            return;
          }
          sequence += 1;
          const input = decoded.value;
          const token = {
            id: "tok_" + String(sequence).padStart(26, "0"),
            name: input.name,
            type: "pat",
            permissions: {
              permission: input.permissions.permission,
              owners: input.permissions.owners ?? [],
              extensions: input.permissions.extensions ?? [],
            },
            createdAt,
            expiresAt,
            lastUsedAt: null,
          };
          tokens = [token, ...tokens];
          sendJson(201, { ...token, token: "axmt_synthetic_fixture_" + sequence });
          return;
        }
        if (request.method === "DELETE" && pathname.startsWith("/v1/tokens/")) {
          const id = pathname.slice("/v1/tokens/".length);
          tokens = tokens.filter((token) => token.id !== id);
          sendJson(204);
          return;
        }
        sendJson(404, { error: "not_found" });
      });
    });
    yield* Effect.callback<void, DeviceAuthServerError>((resume) => {
      const onError = (cause: Error) =>
        resume(Effect.fail(new DeviceAuthServerError({ operation: "listen", cause })));
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", onError);
        resume(Effect.void);
      });
      return Effect.sync(() => {
        server.off("error", onError);
        if (!server.listening) server.close();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string")
      return yield* new DeviceAuthServerError({
        operation: "listen",
        cause: "Expected TCP address",
      });
    return {
      url: `http://127.0.0.1:${address.port}`,
      seededTokenId,
      setOutcome: (next: DeviceOutcome) => {
        outcome = next;
      },
      requests: (): ReadonlyArray<DeviceAuthRequest> => requests.map((request) => ({ ...request })),
      snapshot: () => ({ outcome, tokens: tokens.map((token) => ({ ...token })) }),
      reset: Effect.sync(() => {
        outcome = initialOutcome;
        sequence = 0;
        tokens = [seededToken];
        requests.length = 0;
      }),
      close: Effect.callback<void, DeviceAuthServerError>((resume) => {
        server.close((cause) =>
          resume(
            cause
              ? Effect.fail(new DeviceAuthServerError({ operation: "close", cause }))
              : Effect.void,
          ),
        );
        server.closeIdleConnections();
      }),
    };
  });

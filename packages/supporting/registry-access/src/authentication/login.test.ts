import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { login } from "./login.js";
import {
  authClientOver,
  authCredentialFile,
  authSelectedRegistry,
  deviceLoginRequest,
  makeAuthPorts,
} from "./test-support/test-helpers.js";

// Keep transport responses real through the generated decoder and failure mapper;
// only the wire and local storage/presentation ports are substituted.
describe("login after the Registry refuses a stored credential", () => {
  it.effect.each(["token_expired", "token_revoked", "unrecognized_refusal"])(
    "starts fresh device authorization after %s",
    (code) => {
      const requests: Array<string> = [];
      const wire = HttpClient.make((request) =>
        Effect.sync(() => {
          const path = new URL(request.url).pathname;
          requests.push(path);
          const response =
            path === "/v1/auth/me"
              ? Response.json(
                  {
                    kind: "TokenEndedError",
                    type: `https://registry.example.test/problems/${code}`,
                    title: "Token ended",
                    status: 401,
                    detail: "The presented credential has ended.",
                    code,
                    tokenId: "fixture-token",
                    tokenPrefix: "axmt_fixture",
                    endedAt: "2026-10-15T00:00:00.000Z",
                  },
                  { status: 401 },
                )
              : Response.json({
                  device_code: "fixture-device-code",
                  user_code: "ABCD-1234",
                  verification_uri: "https://identity.example.test/device",
                  verification_uri_complete:
                    "https://identity.example.test/device?user_code=ABCD-1234",
                  interval: 5,
                  expires_in: 300,
                });
          return HttpClientResponse.fromWeb(request, response);
        }),
      );
      const ports = makeAuthPorts({ credentials: authCredentialFile });
      return Effect.gen(function* () {
        const result = yield* login(deviceLoginRequest(), authSelectedRegistry);
        expect(result._tag).toBe("PendingApproval");
        expect(requests).toEqual(["/v1/auth/me", "/v1/auth/device/code"]);
      }).pipe(Effect.provide(Layer.merge(ports.layer, authClientOver(wire))));
    },
  );
});

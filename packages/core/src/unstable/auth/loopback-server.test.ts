import { describe, expect, it } from "@effect/vitest";
import * as NodeHttp from "node:http";
import * as Effect from "effect/Effect";

import {
  LoopbackCallbackRejected,
  LoopbackLoginFallback,
  startLoopbackServer,
} from "./loopback-server.js";

const scheduleCallback = (url: string) => {
  return new Promise<{
    readonly statusCode: number | undefined;
    readonly cacheControl: string | undefined;
    readonly body: string;
  }>((resolve, reject) => {
    setTimeout(() => {
      const request = NodeHttp.get(url, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += String(chunk);
        });
        response.on("end", () =>
          resolve({
            statusCode: response.statusCode,
            cacheControl:
              typeof response.headers["cache-control"] === "string"
                ? response.headers["cache-control"]
                : undefined,
            body,
          }),
        );
      });
      request.on("error", reject);
    }, 10);
  });
};

describe("startLoopbackServer", () => {
  it.effect("closes the listener when its scope ends before a callback", () =>
    Effect.gen(function* () {
      let listenerOrigin = "";

      yield* Effect.scoped(
        Effect.gen(function* () {
          const server = yield* startLoopbackServer("expected-state");
          listenerOrigin = new URL(server.redirectUri).origin;
        }),
      );

      const connection = yield* Effect.tryPromise(() => scheduleCallback(listenerOrigin)).pipe(
        Effect.exit,
      );
      expect(connection._tag).toBe("Failure");
    }),
  );

  it.effect("accepts an exact callback and returns its authorization values", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer("expected-state");
      const callback = new URL(server.redirectUri);
      callback.searchParams.set("code", "axm_pubac_exact");
      callback.searchParams.set("state", "expected-state");
      callback.searchParams.set("iss", "https://agentxm.ai");
      const pageResponse = scheduleCallback(callback.href);

      const result = yield* server.awaitCallback(1_000);
      const response = yield* Effect.promise(() => pageResponse);

      expect(result).toEqual({
        code: "axm_pubac_exact",
        state: "expected-state",
        iss: "https://agentxm.ai",
      });
      expect(response).toMatchObject({ statusCode: 200, cacheControl: "no-store" });
      expect(response.body).toContain("You’re signed in to AgentXM.ai");
      expect(response.body).toContain("Return to your terminal to continue");
      expect(response.body).not.toContain("axm_pubac_exact");
    }).pipe(Effect.scoped),
  );

  it.effect("reports an explicit browser denial", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer("expected-state");
      const callback = new URL(server.redirectUri);
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("state", "expected-state");
      callback.searchParams.set("iss", "https://agentxm.ai");
      const pageResponse = scheduleCallback(callback.href);

      const error = yield* Effect.flip(server.awaitCallback(1_000));
      const response = yield* Effect.promise(() => pageResponse);

      expect(error).toBeInstanceOf(LoopbackCallbackRejected);
      expect(error).toMatchObject({ reason: "access_denied" });
      expect(response).toMatchObject({ statusCode: 400, cacheControl: "no-store" });
      expect(response.body).toContain("Sign-in was cancelled");
      expect(response.body).toContain("No credentials were changed");
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a callback whose OAuth state does not match", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer("expected-state");
      const callback = new URL(server.redirectUri);
      callback.searchParams.set("code", "axm_pubac_wrong_state");
      callback.searchParams.set("state", "unexpected-state");
      callback.searchParams.set("iss", "https://agentxm.ai");
      const pageResponse = scheduleCallback(callback.href);

      const error = yield* Effect.flip(server.awaitCallback(1_000));
      const response = yield* Effect.promise(() => pageResponse);

      expect(error).toBeInstanceOf(LoopbackCallbackRejected);
      expect(error).toMatchObject({ reason: "invalid_callback" });
      expect(response).toMatchObject({ statusCode: 400, cacheControl: "no-store" });
      expect(response.body).toContain("AXM sign-in could not be completed");
      expect(response.body).not.toContain("unexpected-state");
    }).pipe(Effect.scoped),
  );

  it.live("closes the listener and reports a timeout when no callback arrives", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer("expected-state");

      const error = yield* Effect.flip(server.awaitCallback(10));

      expect(error).toBeInstanceOf(LoopbackLoginFallback);
      expect(error).toMatchObject({ reason: "timeout" });
    }).pipe(Effect.scoped),
  );
});

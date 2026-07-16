import { describe, expect, it } from "@effect/vitest";
import * as NodeHttp from "node:http";
import * as Effect from "effect/Effect";

import {
  LoopbackCallbackRejected,
  LoopbackLoginFallback,
  startLoopbackServer,
} from "./loopback-server.js";

const scheduleCallback = (url: string) => {
  setTimeout(() => {
    const request = NodeHttp.get(url, (response) => response.resume());
    request.on("error", () => undefined);
  }, 10);
};

describe("startLoopbackServer", () => {
  it.effect("accepts an exact callback and returns its authorization values", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer();
      const callback = new URL(server.redirectUri);
      callback.searchParams.set("code", "axm_pubac_exact");
      callback.searchParams.set("state", "expected-state");
      callback.searchParams.set("iss", "https://agentxm.ai");
      scheduleCallback(callback.href);

      const result = yield* server.awaitCallback("expected-state", 1_000);

      expect(result).toEqual({
        code: "axm_pubac_exact",
        state: "expected-state",
        iss: "https://agentxm.ai",
      });
    }),
  );

  it.effect("reports an explicit browser denial", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer();
      const callback = new URL(server.redirectUri);
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("state", "expected-state");
      callback.searchParams.set("iss", "https://agentxm.ai");
      scheduleCallback(callback.href);

      const error = yield* Effect.flip(server.awaitCallback("expected-state", 1_000));

      expect(error).toBeInstanceOf(LoopbackCallbackRejected);
      expect(error).toMatchObject({ reason: "access_denied" });
    }),
  );

  it.effect("rejects a callback whose OAuth state does not match", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer();
      const callback = new URL(server.redirectUri);
      callback.searchParams.set("code", "axm_pubac_wrong_state");
      callback.searchParams.set("state", "unexpected-state");
      callback.searchParams.set("iss", "https://agentxm.ai");
      scheduleCallback(callback.href);

      const error = yield* Effect.flip(server.awaitCallback("expected-state", 1_000));

      expect(error).toBeInstanceOf(LoopbackCallbackRejected);
      expect(error).toMatchObject({ reason: "invalid_callback" });
    }),
  );

  it.effect("closes the listener and reports a timeout when no callback arrives", () =>
    Effect.gen(function* () {
      const server = yield* startLoopbackServer();

      const error = yield* Effect.flip(server.awaitCallback("expected-state", 10));

      expect(error).toBeInstanceOf(LoopbackLoginFallback);
      expect(error).toMatchObject({ reason: "timeout" });
    }),
  );
});

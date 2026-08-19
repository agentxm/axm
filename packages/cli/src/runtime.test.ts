import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { makeCliLoggerLayer, resolveBuiltInRegistryLocation, withAxmUserAgent } from "./runtime.js";

describe("resolveBuiltInRegistryLocation", () => {
  it("prefers AXM_REGISTRY_LOCATION when set to a remote URL", () => {
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: "https://registry.example.test" },
      "https://registry.agentxm.ai",
    );

    expect(location).toBe("https://registry.example.test/");
  });

  it("normalizes filesystem paths to file URLs", () => {
    const registryPath = path.join(process.cwd(), "tmp", "registry");
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: registryPath },
      "https://registry.agentxm.ai",
    );

    expect(location).toBe(pathToFileURL(registryPath).href);
  });

  it("falls back to AXM_REGISTRY_URL when AXM_REGISTRY_LOCATION is unset", () => {
    const location = resolveBuiltInRegistryLocation({}, "https://registry.example.test");

    expect(location).toBe("https://registry.example.test/");
  });

  it("treats an empty AXM_REGISTRY_LOCATION as unset", () => {
    const location = resolveBuiltInRegistryLocation(
      { AXM_REGISTRY_LOCATION: "" },
      "https://registry.example.test",
    );

    expect(location).toBe("https://registry.example.test/");
  });
});

describe("withAxmUserAgent", () => {
  it.effect("adds the CLI name and version to every request", () =>
    Effect.gen(function* () {
      let observedUserAgent: string | undefined;
      const client = withAxmUserAgent(
        HttpClient.make((request) =>
          Effect.sync(() => {
            observedUserAgent = request.headers["user-agent"];
            return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }));
          }),
        ),
        "1.2.3",
      );

      yield* client.execute(HttpClientRequest.get("https://registry.example.test"));

      expect(observedUserAgent).toBe("axm-cli/1.2.3");
    }),
  );
});

describe("makeCliLoggerLayer", () => {
  it.effect("routes debug diagnostics to stderr", () =>
    Effect.gen(function* () {
      const errors: Array<ReadonlyArray<unknown>> = [];
      const logs: Array<ReadonlyArray<unknown>> = [];
      const testConsole: Console.Console = {
        ...console,
        error: (...args: ReadonlyArray<unknown>) => errors.push(args),
        log: (...args: ReadonlyArray<unknown>) => logs.push(args),
      };

      yield* Effect.logDebug("machine-safe debug message").pipe(
        Effect.provideService(Console.Console, testConsole),
        Effect.provide(makeCliLoggerLayer("debug")),
      );

      expect(errors).toHaveLength(1);
      expect(logs).toHaveLength(0);
    }),
  );

  it.effect("emits warnings but suppresses debug diagnostics at normal verbosity", () =>
    Effect.gen(function* () {
      const errors: Array<ReadonlyArray<unknown>> = [];
      const testConsole: Console.Console = {
        ...console,
        error: (...args: ReadonlyArray<unknown>) => errors.push(args),
      };

      yield* Effect.gen(function* () {
        yield* Effect.logDebug("hidden debug message");
        yield* Effect.logWarning("visible warning message");
      }).pipe(
        Effect.provideService(Console.Console, testConsole),
        Effect.provide(makeCliLoggerLayer("normal")),
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]?.join(" ")).toContain("visible warning message");
    }),
  );

  it.effect("emits machine-mode warnings as one typed JSON log event", () =>
    Effect.gen(function* () {
      const errors: Array<ReadonlyArray<unknown>> = [];
      const testConsole: Console.Console = {
        ...console,
        error: (...args: ReadonlyArray<unknown>) => errors.push(args),
      };

      yield* Effect.logWarning("OS keychain unavailable; using restricted credential file.").pipe(
        Effect.provideService(Console.Console, testConsole),
        Effect.provide(makeCliLoggerLayer("normal", "json")),
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual([
        JSON.stringify({
          type: "log",
          level: "warn",
          message: "OS keychain unavailable; using restricted credential file.",
        }),
      ]);
    }),
  );
});

/**
 * Unit tests for the upgrade handler.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach } from "vitest";

import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestRenderer, logsByTag } from "@agentxm/client-core/unstable/cli-renderer";
import {
  InstallMethod,
  Script,
  Homebrew,
  Npm,
  Unknown,
  type InstallMethodType,
} from "@agentxm/client-core/unstable/install-method";
import { InstallMeta, type InstallMetaData } from "@agentxm/client-core/unstable/install-meta";

import { handleUpgrade, resolvePlatformBinary, makeDownloadUrl } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeMockInstallMethod = (method: InstallMethodType) =>
  Layer.succeed(InstallMethod, {
    detect: () => Effect.succeed(method),
  });

const makeMockInstallMeta = () => {
  const written: Array<InstallMetaData> = [];
  const layer = Layer.succeed(InstallMeta, {
    read: () => Effect.succeed(Option.none()),
    write: (data: InstallMetaData) =>
      Effect.sync(() => {
        written.push(data);
      }),
  });
  return { layer, written };
};

const makeMockHttpClient = (handler: (url: string) => Response): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request.url))),
  );

const makeNetworkErrorClient = (): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("ECONNREFUSED"),
          description: "Connection refused",
        }),
      }),
    ),
  );

/** A mock binary payload — non-empty content. */
const MOCK_BINARY = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);

/** Build a handler that serves a valid binary for download URLs and JSON for API URLs. */
const makeSuccessHandler =
  (remoteVersion = "99.0.0") =>
  (url: string) => {
    if (url.includes("/releases/download/")) {
      return new Response(MOCK_BINARY, { status: 200 });
    }
    // API endpoint
    return new Response(JSON.stringify({ tag_name: `cli-v${remoteVersion}` }), {
      status: 200,
    });
  };

interface TestLayersOptions {
  readonly method?: InstallMethodType;
  readonly httpHandler?: (url: string) => Response;
  readonly httpClient?: HttpClient.HttpClient;
}

const makeTestLayers = (opts?: TestLayersOptions) => {
  const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
  const logs = logsByTag(rendererState);
  const installMeta = makeMockInstallMeta();

  const method = opts?.method ?? new Script({ execPath: "/tmp/test-bin/axm" });
  const installMethodLayer = makeMockInstallMethod(method);

  const httpClientLayer = opts?.httpClient
    ? Layer.succeed(HttpClient.HttpClient, opts.httpClient)
    : Layer.succeed(
        HttpClient.HttpClient,
        opts?.httpHandler
          ? makeMockHttpClient(opts.httpHandler)
          : makeMockHttpClient(makeSuccessHandler()),
      );

  const fullLayer = Layer.mergeAll(
    NodeServices.layer,
    rendererLayer,
    TestFlagsLayer(),
    installMethodLayer,
    installMeta.layer,
    httpClientLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(fullLayer));

  return { provide, rendererState, logs, installMeta };
};

// =============================================================================
// Pure helper tests
// =============================================================================

describe("resolvePlatformBinary", () => {
  it("resolves darwin arm64", () => {
    const result = resolvePlatformBinary("darwin", "arm64");
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.binaryName).toBe("axm-darwin-arm64");
    }
  });

  it("resolves linux x64", () => {
    const result = resolvePlatformBinary("linux", "x64");
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.binaryName).toBe("axm-linux-x64");
    }
  });

  it("resolves win32 x64", () => {
    const result = resolvePlatformBinary("win32", "x64");
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.binaryName).toBe("axm-windows-x64.exe");
    }
  });

  it("returns None for unsupported platform", () => {
    const result = resolvePlatformBinary("freebsd", "x64");
    expect(Option.isNone(result)).toBe(true);
  });
});

describe("makeDownloadUrl", () => {
  it("builds correct URL", () => {
    const url = makeDownloadUrl("agentxm/axm", "0.2.0", "axm-darwin-arm64");
    expect(url).toBe(
      "https://github.com/agentxm/axm/releases/download/cli-v0.2.0/axm-darwin-arm64",
    );
  });

  it("builds URL with custom repo", () => {
    const url = makeDownloadUrl("my-org/my-cli", "1.0.0", "axm-linux-x64");
    expect(url).toBe("https://github.com/my-org/my-cli/releases/download/cli-v1.0.0/axm-linux-x64");
  });
});

// =============================================================================
// Delegation messages
// =============================================================================

describe("handleUpgrade", () => {
  describe("homebrew delegation", () => {
    it.effect("prints brew upgrade message", () => {
      const { provide, logs } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.info).toContain("Installed via Homebrew");
          expect(logs.info).toContain("Run: brew upgrade agentxm/tap/axm");
        }),
      );
    });

    it.effect("notes that --force has no effect", () => {
      const { provide, logs } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.info).toContain("--force has no effect for Homebrew installs.");
          expect(logs.info).toContain("Run: brew upgrade agentxm/tap/axm");
        }),
      );
    });
  });

  describe("npm delegation", () => {
    it.effect("prints npm update message", () => {
      const { provide, logs } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.info).toContain("Installed via npm");
          expect(logs.info).toContain("Run: npm update -g axm.sh");
        }),
      );
    });

    it.effect("notes that --force has no effect", () => {
      const { provide, logs } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.info).toContain("--force has no effect for npm installs.");
          expect(logs.info).toContain("Run: npm update -g axm.sh");
        }),
      );
    });
  });

  describe("unknown delegation", () => {
    it.effect("prints install script URL", () => {
      const { provide, logs } = makeTestLayers({
        method: new Unknown(),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.info).toContain("Install method could not be determined.");
          expect(logs.info.some((msg) => msg.includes("curl -fsSL https://get.agentxm.ai"))).toBe(
            true,
          );
        }),
      );
    });

    it.effect("notes that --force has no effect", () => {
      const { provide, logs } = makeTestLayers({
        method: new Unknown(),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.info).toContain("--force has no effect for this install method.");
        }),
      );
    });
  });

  // ===========================================================================
  // Script self-update
  // ===========================================================================

  describe("script self-update", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-test-"));
      // Create a fake binary for the handler to replace
      fs.writeFileSync(path.join(tempDir, "axm"), "#!/bin/sh\necho unknown\n", { mode: 0o755 });
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const makeScriptLayers = (
      dir: string,
      opts?: { httpHandler?: (url: string) => Response; httpClient?: HttpClient.HttpClient },
    ) =>
      makeTestLayers({
        method: new Script({ execPath: path.join(dir, "axm") }),
        ...opts,
      });

    it.effect("downloads and replaces binary when stale", () => {
      const { provide, rendererState, installMeta } = makeScriptLayers(tempDir, {
        httpHandler: makeSuccessHandler("99.0.0"),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          // Should have a spinner message about downloading
          expect(rendererState.spinnerMessages.some((msg) => msg.includes("Downloading"))).toBe(
            true,
          );
          // Should have written install metadata
          expect(installMeta.written.length).toBeGreaterThan(0);
          expect(installMeta.written[0]?.method).toBe("script");
        }),
      );
    });

    it.effect("force flag re-downloads even when up to date", () => {
      const { provide, rendererState, installMeta } = makeScriptLayers(tempDir, {
        httpHandler: makeSuccessHandler("99.0.0"),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          // Should have a spinner message about downloading
          expect(rendererState.spinnerMessages.some((msg) => msg.includes("Downloading"))).toBe(
            true,
          );
          // Should have written install metadata
          expect(installMeta.written.length).toBeGreaterThan(0);
        }),
      );
    });

    it.effect("handles download failure (404)", () => {
      const { provide } = makeScriptLayers(tempDir, {
        httpHandler: (url: string) => {
          if (url.includes("/releases/download/")) {
            return new Response("Not Found", { status: 404 });
          }
          return new Response(JSON.stringify({ tag_name: "cli-v99.0.0" }), { status: 200 });
        },
      });
      return provide(
        Effect.gen(function* () {
          const result = yield* handleUpgrade({ force: false }).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
          );
          expect(result).toMatchObject({ error: true, code: "network" });
        }),
      );
    });

    it.effect("handles network error during version check", () => {
      const { provide } = makeScriptLayers(tempDir, {
        httpClient: makeNetworkErrorClient(),
      });
      return provide(
        Effect.gen(function* () {
          const result = yield* handleUpgrade({ force: false }).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
          );
          expect(result).toMatchObject({ error: true, code: "network" });
        }),
      );
    });

    it.effect("handles empty download", () => {
      const { provide } = makeScriptLayers(tempDir, {
        httpHandler: (url: string) => {
          if (url.includes("/releases/download/")) {
            return new Response(new Uint8Array(0), { status: 200 });
          }
          return new Response(JSON.stringify({ tag_name: "cli-v99.0.0" }), { status: 200 });
        },
      });
      return provide(
        Effect.gen(function* () {
          const result = yield* handleUpgrade({ force: false }).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
          );
          expect(result).toMatchObject({ error: true, code: "validation" });
        }),
      );
    });
  });

  // ===========================================================================
  // Force flag on non-script installs
  // ===========================================================================

  describe("--force on non-script installs", () => {
    it.effect("force flag is noted but does not error for homebrew", () => {
      const { provide, logs } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.info).toContain("--force has no effect for Homebrew installs.");
          // Still shows the delegation message
          expect(logs.info).toContain("Run: brew upgrade agentxm/tap/axm");
        }),
      );
    });

    it.effect("force flag is noted but does not error for npm", () => {
      const { provide, logs } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.info).toContain("--force has no effect for npm installs.");
          expect(logs.info).toContain("Run: npm update -g axm.sh");
        }),
      );
    });

    it.effect("force flag is noted but does not error for unknown", () => {
      const { provide, logs } = makeTestLayers({
        method: new Unknown(),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.info).toContain("--force has no effect for this install method.");
        }),
      );
    });
  });
});

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
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  InstallMethod,
  Script,
  Homebrew,
  Npm,
  Unknown,
  type InstallMethodType,
} from "@agentxm/client-core/unstable/install-method";
import { InstallMeta, type InstallMetaData } from "@agentxm/client-core/unstable/install-meta";

import { expectAppliedPlanResult, expectNoOpPlanResult } from "../../test-helpers.js";
import { handleUpgrade, resolvePlatformBinary, makeDownloadUrl } from "./handler.js";
import { Subprocess, type CommandResult, type RunCommandOptions } from "./subprocess.js";
import { loadVersion } from "../../version.js";

const LOCAL_VERSION = loadVersion();

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
  readonly subprocess?: ReturnType<typeof makeMockSubprocess>;
  readonly machine?: boolean;
}

interface CommandInvocation {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly options: RunCommandOptions | undefined;
}

const commandResult = (opts?: {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
}): CommandResult => ({
  exitCode: opts?.exitCode ?? 0,
  stdout: opts?.stdout ?? "99.0.0\n",
  stderr: opts?.stderr ?? "",
});

const makeMockSubprocess = (
  handler?: (invocation: CommandInvocation) => CommandResult,
): {
  readonly calls: Array<CommandInvocation>;
  readonly layer: Layer.Layer<Subprocess>;
} => {
  const calls: Array<CommandInvocation> = [];
  const layer = Layer.succeed(Subprocess, {
    run: (command: string, args: ReadonlyArray<string>, options?: RunCommandOptions) =>
      Effect.sync(() => {
        const invocation = { command, args: [...args], options };
        calls.push(invocation);
        return handler?.(invocation) ?? commandResult();
      }),
  });
  return { calls, layer };
};

const makeTestLayers = (opts?: TestLayersOptions) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererLayer = renderer.layer;
  const rendererState = renderer.state;
  const logs = logsByTag(rendererState);
  const installMeta = makeMockInstallMeta();
  const subprocess = opts?.subprocess ?? makeMockSubprocess();

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
    subprocess.layer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(fullLayer));

  return { provide, rendererState, logs, installMeta, subprocess };
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

describe("handleUpgrade", () => {
  describe("homebrew upgrades", () => {
    it.effect("runs brew upgrade and verifies axm resolved on PATH", () => {
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "brew" && invocation.args.join(" ") === "tap") {
          return commandResult({ stdout: "agentxm/tap\n" });
        }
        return commandResult();
      });
      const { provide, logs, rendererState } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toContain("Upgraded to 99.0.0");
          expect(
            subprocess.calls.some(
              (call) =>
                call.command === "brew" && call.args.join(" ") === "upgrade agentxm/tap/axm",
            ),
          ).toBe(true);
          expect(
            subprocess.calls.some(
              (call) => call.command === "axm" && call.args.join(" ") === "--version",
            ),
          ).toBe(true);
          expect(rendererState.suggestions).toEqual([
            { description: "Verify installed version", cmd: "axm --version" },
          ]);
          // Regression: verify `axm` resolved on PATH, never the stale
          // `process.execPath` — `brew upgrade` removes the old Cellar
          // directory, so spawning that path fails on a successful upgrade.
          expect(subprocess.calls.some((call) => call.command === process.execPath)).toBe(false);
        }),
      );
    });

    it.effect("taps Homebrew formula when missing", () => {
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "brew" && invocation.args.join(" ") === "tap") {
          return commandResult({ stdout: "homebrew/core\n" });
        }
        return commandResult();
      });
      const { provide } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(
            subprocess.calls.some(
              (call) => call.command === "brew" && call.args.join(" ") === "tap agentxm/tap",
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("fails with manual fallback when brew upgrade fails", () => {
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "brew" && invocation.args.join(" ") === "tap") {
          return commandResult({ stdout: "agentxm/tap\n" });
        }
        if (
          invocation.command === "brew" &&
          invocation.args.join(" ") === "upgrade agentxm/tap/axm"
        ) {
          return commandResult({ exitCode: 1, stderr: "Permission denied" });
        }
        return commandResult();
      });
      const { provide } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          const result = yield* handleUpgrade({ force: false }).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                code: e.code,
                message: e.detail,
                cmd: e.suggestions?.[1]?.cmd,
              }),
            ),
          );
          expect(result).toMatchObject({
            error: true,
            code: "internal",
            cmd: "brew upgrade agentxm/tap/axm",
          });
        }),
      );
    });

    it.effect("short-circuits when already up to date and force is not set", () => {
      const subprocess = makeMockSubprocess();
      const { provide, logs } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        httpHandler: makeSuccessHandler(LOCAL_VERSION),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toContain(`Already up to date (${LOCAL_VERSION})`);
          expect(subprocess.calls.some((call) => call.command === "brew")).toBe(false);
        }),
      );
    });

    it.effect("reinstalls when --force and already up to date", () => {
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "brew" && invocation.args.join(" ") === "tap") {
          return commandResult({ stdout: "agentxm/tap\n" });
        }
        return commandResult({ stdout: `${LOCAL_VERSION}\n` });
      });
      const { provide, logs } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        httpHandler: makeSuccessHandler(LOCAL_VERSION),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.success).not.toContain(`Already up to date (${LOCAL_VERSION})`);
          expect(logs.success).toContain(`Reinstalled ${LOCAL_VERSION}`);
          expect(
            subprocess.calls.some(
              (call) =>
                call.command === "brew" && call.args.join(" ") === "reinstall agentxm/tap/axm",
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("refreshes the agentxm tap with update-reset before upgrading", () => {
      const tapPath = "/opt/homebrew/Library/Taps/agentxm/homebrew-tap";
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "brew" && invocation.args.join(" ") === "tap") {
          return commandResult({ stdout: "agentxm/tap\n" });
        }
        if (invocation.command === "brew" && invocation.args[0] === "--repository") {
          return commandResult({ stdout: `${tapPath}\n` });
        }
        return commandResult();
      });
      const { provide } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          const updateResetIndex = subprocess.calls.findIndex(
            (call) => call.command === "brew" && call.args[0] === "update-reset",
          );
          const upgradeIndex = subprocess.calls.findIndex(
            (call) => call.command === "brew" && call.args.join(" ") === "upgrade agentxm/tap/axm",
          );
          expect(updateResetIndex).toBeGreaterThanOrEqual(0);
          expect(upgradeIndex).toBeGreaterThanOrEqual(0);
          // refresh must run before the upgrade so brew sees the latest formula
          expect(updateResetIndex).toBeLessThan(upgradeIndex);
          // update-reset targets the resolved tap path, not the tap name
          expect(subprocess.calls[updateResetIndex]?.args[1]).toBe(tapPath);
        }),
      );
    });

    it.effect("reports incomplete outcome when the binary still reports the old version", () => {
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "brew" && invocation.args.join(" ") === "tap") {
          return commandResult({ stdout: "agentxm/tap\n" });
        }
        // `axm --version` still reports the pre-upgrade version: brew was a no-op
        if (invocation.command === "axm") {
          return commandResult({ stdout: `${LOCAL_VERSION}\n` });
        }
        return commandResult();
      });
      const { provide, logs } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        httpHandler: makeSuccessHandler("99.0.0"),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).not.toContain("Upgraded to 99.0.0");
          expect(logs.success).toContain("Upgrade incomplete");
          expect(
            logs.warn.some(
              (msg) => msg.includes(`still reports ${LOCAL_VERSION}`) && msg.includes("99.0.0"),
            ),
          ).toBe(true);
          expect(
            logs.info.some(
              (msg) => msg.includes(`still reports ${LOCAL_VERSION}`) && msg.includes("99.0.0"),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("emits incomplete JSON in machine mode without pre-result warnings", () => {
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "brew" && invocation.args.join(" ") === "tap") {
          return commandResult({ stdout: "agentxm/tap\n" });
        }
        if (invocation.command === "axm") {
          return commandResult({ stdout: `${LOCAL_VERSION}\n` });
        }
        return commandResult();
      });
      const { provide, rendererState, logs } = makeTestLayers({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        httpHandler: makeSuccessHandler("99.0.0"),
        subprocess,
        machine: true,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toEqual([]);
          expect(logs.warn).toEqual([]);
          expect(rendererState.results[0]?.data).toMatchObject({
            result: {
              status: "upgrade-incomplete",
              installMethod: "homebrew",
              localVersion: LOCAL_VERSION,
              targetVersion: "99.0.0",
              delegatedCommand: "brew upgrade agentxm/tap/axm",
              force: false,
              warnings: [expect.stringContaining(`still reports ${LOCAL_VERSION}`)],
            },
          });
        }),
      );
    });
  });

  describe("npm upgrades", () => {
    it.effect("runs pinned npm install and verifies the upgraded binary", () => {
      const subprocess = makeMockSubprocess();
      const { provide, logs } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toContain("Upgraded to 99.0.0");
          expect(
            subprocess.calls.some(
              (call) =>
                call.command === "npm" && call.args.join(" ") === "install -g axm.sh@99.0.0",
            ),
          ).toBe(true);
          // Regression: verify `axm` resolved on PATH, never `process.execPath`
          // — `npm install -g` replaces the running binary's file in place.
          expect(
            subprocess.calls.some(
              (call) => call.command === "axm" && call.args.join(" ") === "--version",
            ),
          ).toBe(true);
          expect(subprocess.calls.some((call) => call.command === process.execPath)).toBe(false);
        }),
      );
    });

    it.effect("fails with manual fallback when npm install fails", () => {
      const subprocess = makeMockSubprocess((invocation) => {
        if (invocation.command === "npm") {
          return commandResult({ exitCode: 1, stderr: "EACCES: permission denied" });
        }
        return commandResult();
      });
      const { provide } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          const result = yield* handleUpgrade({ force: false }).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                code: e.code,
                message: e.detail,
                cmd: e.suggestions?.[1]?.cmd,
              }),
            ),
          );
          expect(result).toMatchObject({
            error: true,
            code: "internal",
            message: "npm upgrade failed. This looks like a permissions issue.",
            cmd: "npm install -g axm.sh@99.0.0",
          });
        }),
      );
    });

    it.effect("short-circuits when already up to date and force is not set", () => {
      const subprocess = makeMockSubprocess();
      const { provide, logs } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
        httpHandler: makeSuccessHandler(LOCAL_VERSION),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toContain(`Already up to date (${LOCAL_VERSION})`);
          expect(subprocess.calls.some((call) => call.command === "npm")).toBe(false);
        }),
      );
    });

    it.effect("emits already-up-to-date JSON in machine mode without human logs", () => {
      const subprocess = makeMockSubprocess();
      const { provide, rendererState, logs } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
        httpHandler: makeSuccessHandler(LOCAL_VERSION),
        subprocess,
        machine: true,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toEqual([]);
          expect(logs.info).toEqual([]);
          const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Upgrade AXM CLI",
            totalSteps: 1,
          });
          expect(result).toMatchObject({
            steps: [
              {
                label: "AXM CLI",
                status: "unchanged",
                artifact: {
                  path: "axm",
                  scope: "user",
                  version: LOCAL_VERSION,
                  change: "unchanged",
                },
              },
            ],
            status: "already-up-to-date",
            installMethod: "npm",
            localVersion: LOCAL_VERSION,
            targetVersion: LOCAL_VERSION,
            force: false,
          });
          expect(rendererState.suggestions).toEqual([
            { description: "Verify installed version", cmd: "axm --version" },
            { description: "Reinstall current version", cmd: "axm upgrade --force" },
          ]);
          expect(subprocess.calls.some((call) => call.command === "npm")).toBe(false);
        }),
      );
    });

    it.effect("reinstalls when --force and already up to date", () => {
      const subprocess = makeMockSubprocess((invocation) =>
        invocation.command === "npm"
          ? commandResult()
          : commandResult({ stdout: `${LOCAL_VERSION}\n` }),
      );
      const { provide, logs } = makeTestLayers({
        method: new Npm({ importUrl: "file:///node_modules/axm.sh" }),
        httpHandler: makeSuccessHandler(LOCAL_VERSION),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.success).not.toContain(`Already up to date (${LOCAL_VERSION})`);
          expect(logs.success).toContain(`Reinstalled ${LOCAL_VERSION}`);
          expect(
            subprocess.calls.some(
              (call) =>
                call.command === "npm" &&
                call.args.join(" ") === `install -g axm.sh@${LOCAL_VERSION}`,
            ),
          ).toBe(true);
        }),
      );
    });
  });

  describe("unknown delegation", () => {
    it.effect("prints install script URL", () => {
      const { provide, rendererState, logs } = makeTestLayers({
        method: new Unknown(),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toContain("Upgrade command delegated");
          expect(logs.info).toContain("Install method could not be determined.");
          expect(
            logs.info.some((msg) => msg.includes("curl -fsSL https://axm.sh/install.sh")),
          ).toBe(false);
          expect(rendererState.suggestions).toEqual([
            {
              description: "Run the delegated install command",
              cmd: "curl -fsSL https://axm.sh/install.sh | sh",
            },
            { description: "Verify installed version", cmd: "axm --version" },
          ]);
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

    it.effect("emits delegated JSON in machine mode without human logs", () => {
      const { provide, rendererState, logs } = makeTestLayers({
        method: new Unknown(),
        machine: true,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.success).toEqual([]);
          expect(logs.info).toEqual([]);
          const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Upgrade AXM CLI",
            totalSteps: 1,
          });
          expect(result).toMatchObject({
            steps: [
              {
                label: "AXM CLI",
                status: "unchanged",
                artifact: {
                  path: "curl -fsSL https://axm.sh/install.sh | sh",
                  scope: "user",
                  change: "unchanged",
                },
              },
            ],
            status: "delegated",
            installMethod: "unknown",
            localVersion: LOCAL_VERSION,
            delegatedCommand: "curl -fsSL https://axm.sh/install.sh | sh",
            force: true,
          });
          expect(rendererState.suggestions).toEqual([
            {
              description: "Run the delegated install command",
              cmd: "curl -fsSL https://axm.sh/install.sh | sh",
            },
            { description: "Verify installed version", cmd: "axm --version" },
          ]);
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
      opts?: {
        readonly httpHandler?: (url: string) => Response;
        readonly httpClient?: HttpClient.HttpClient;
        readonly subprocess?: ReturnType<typeof makeMockSubprocess>;
        readonly machine?: boolean;
      },
    ) =>
      makeTestLayers({
        method: new Script({ execPath: path.join(dir, "axm") }),
        ...opts,
      });

    it.effect("downloads and replaces binary when stale", () => {
      const { provide, logs, installMeta } = makeScriptLayers(tempDir, {
        httpHandler: makeSuccessHandler("99.0.0"),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toContain("Upgraded to 99.0.0");
          // Should have written install metadata
          expect(installMeta.written.length).toBeGreaterThan(0);
          expect(installMeta.written[0]?.method).toBe("script");
        }),
      );
    });

    it.effect("force flag re-downloads even when up to date", () => {
      const { provide, logs, installMeta } = makeScriptLayers(tempDir, {
        httpHandler: makeSuccessHandler("99.0.0"),
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: true });
          expect(logs.success).toContain("Upgraded to 99.0.0");
          // Should have written install metadata
          expect(installMeta.written.length).toBeGreaterThan(0);
        }),
      );
    });

    it.effect("emits upgraded JSON in machine mode without human logs", () => {
      const subprocess = makeMockSubprocess();
      const { provide, rendererState, logs } = makeScriptLayers(tempDir, {
        httpHandler: makeSuccessHandler("99.0.0"),
        subprocess,
        machine: true,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toEqual([]);
          expect(logs.warn).toEqual([]);
          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Upgrade AXM CLI",
          });
          expect(result).toMatchObject({
            steps: [
              {
                label: "AXM CLI",
                status: "applied",
                artifact: {
                  path: "axm",
                  scope: "user",
                  version: "99.0.0",
                  previousVersion: LOCAL_VERSION,
                  change: "updated",
                },
              },
            ],
            status: "upgraded",
            installMethod: "script",
            localVersion: LOCAL_VERSION,
            targetVersion: "99.0.0",
            force: false,
          });
          expect(rendererState.suggestions).toEqual([
            { description: "Verify installed version", cmd: "axm --version" },
          ]);
        }),
      );
    });

    it.effect("carries script verification warnings in machine output", () => {
      const execPath = path.join(tempDir, "axm");
      const subprocess = makeMockSubprocess((invocation) =>
        invocation.command === execPath
          ? commandResult({ exitCode: 1, stderr: "verify failed" })
          : commandResult(),
      );
      const { provide, rendererState, logs } = makeScriptLayers(tempDir, {
        httpHandler: makeSuccessHandler("99.0.0"),
        subprocess,
        machine: true,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toEqual([]);
          expect(logs.warn).toEqual([]);
          expect(rendererState.results[0]?.data).toMatchObject({
            result: {
              status: "upgraded",
              installMethod: "script",
              warnings: ["Could not verify new binary. Check the installed version."],
            },
          });
        }),
      );
    });

    it.effect("renders script verification warnings as warning logs in human mode", () => {
      const execPath = path.join(tempDir, "axm");
      const subprocess = makeMockSubprocess((invocation) =>
        invocation.command === execPath
          ? commandResult({ exitCode: 1, stderr: "verify failed" })
          : commandResult(),
      );
      const { provide, logs } = makeScriptLayers(tempDir, {
        httpHandler: makeSuccessHandler("99.0.0"),
        subprocess,
      });
      return provide(
        Effect.gen(function* () {
          yield* handleUpgrade({ force: false });
          expect(logs.success).toContain("Upgraded to 99.0.0");
          expect(logs.info).not.toContain(
            "Could not verify new binary. Check the installed version.",
          );
          expect(logs.warn).toContain("Could not verify new binary. Check the installed version.");
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

  describe("--force on unknown install method", () => {
    it.effect("force flag is noted but does not error", () => {
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

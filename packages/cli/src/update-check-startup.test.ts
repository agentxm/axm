/**
 * Unit tests for the update check CLI startup integration.
 *
 * Covers: notification after command output, skip conditions, detached fiber
 * spawn on stale/missing cache, no notification on first run (cache missing).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, afterEach, beforeEach } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import {
  InstallMethod,
  Unknown,
  Script,
  Homebrew,
  Npm,
  type InstallMethodType,
} from "@axm.sh/core/unstable/install-method";
import { UpdateCheck, UpdateCheckTest } from "@axm.sh/core/unstable/update-check";

import {
  type NotificationPrinter,
  type UpdateCheckContextInputs,
  buildSkipContext,
  isUpgradeCommand,
  refreshCache,
  withUpdateCheck,
} from "./update-check-startup.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const freshTimestamp = () => new Date().toISOString();

const LOCAL_VERSION = "0.1.0";
const REMOTE_VERSION = "0.2.0";

/** Base inputs for a normal interactive session (stderr TTY override for tests). */
const baseInputs: UpdateCheckContextInputs = {
  args: ["skills", "list"],
  isNonInteractive: false,
  isJsonOutput: false,
  isStderrTTY: true,
  isAgentSession: false,
  noUpdateCheckEnv: false,
};

const makeMockInstallMethod = (method: InstallMethodType) =>
  Layer.succeed(InstallMethod, {
    detect: () => Effect.succeed(method),
  });

const makeMockHttpClient = (handler: (url: string) => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request.url))),
    ),
  );

const makeSuccessHttpClient = (remoteVersion = REMOTE_VERSION) =>
  makeMockHttpClient((url: string) => {
    if (url.includes("/releases/latest")) {
      return new Response(JSON.stringify({ tag_name: `cli-v${remoteVersion}` }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify([{ tag_name: `cli-v${remoteVersion}` }]), {
      status: 200,
    });
  });

/** Collects notification messages for assertions. */
const makeTestPrinter = (): {
  readonly printer: NotificationPrinter;
  readonly messages: Array<string>;
} => {
  const messages: Array<string> = [];
  const printer: NotificationPrinter = (message) =>
    Effect.sync(() => {
      messages.push(message);
    });
  return { printer, messages };
};

interface TestLayerOptions {
  readonly tempDir: string;
  readonly cacheData?: { latestVersion: string; checkedAt: string } | undefined;
  readonly method?: InstallMethodType;
  readonly remoteVersion?: string;
}

const makeTestLayers = (opts: TestLayerOptions) => {
  const cachePath = path.join(opts.tempDir, "update-check.json");
  if (opts.cacheData) {
    fs.writeFileSync(cachePath, JSON.stringify(opts.cacheData));
  }

  const updateCheckLayer = UpdateCheckTest(cachePath).pipe(Layer.provide(NodeServices.layer));
  const installMethodLayer = makeMockInstallMethod(opts.method ?? new Unknown());
  const httpClientLayer = makeSuccessHttpClient(opts.remoteVersion ?? REMOTE_VERSION);
  const { layer: rendererLayer } = TestRenderer.make();

  return Layer.mergeAll(
    updateCheckLayer,
    installMethodLayer,
    httpClientLayer,
    rendererLayer,
    NodeServices.layer,
  );
};

/**
 * Create mock UpdateCheck that tracks calls for fiber-spawn verification.
 */
const makeTrackingUpdateCheck = (opts: {
  readonly cacheResult: "none" | "fresh" | "stale";
  readonly updateAvailable: boolean;
}) => {
  const calls = {
    readCache: 0,
    writeCache: 0,
    isUpdateAvailable: 0,
  };
  const freshCache = { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() };

  const service: typeof UpdateCheck.Service = {
    readCache: () =>
      Effect.sync(() => {
        calls.readCache++;
        switch (opts.cacheResult) {
          case "none":
            return Option.none();
          case "fresh":
            return Option.some(freshCache);
          case "stale":
            // readCacheFromPath returns None for stale cache
            return Option.none();
        }
      }),
    writeCache: () =>
      Effect.sync(() => {
        calls.writeCache++;
      }),
    isUpdateAvailable: () =>
      Effect.sync(() => {
        calls.isUpdateAvailable++;
        if (opts.updateAvailable) {
          return Option.some({ current: LOCAL_VERSION, latest: REMOTE_VERSION });
        }
        return Option.none();
      }),
    shouldSkip: (ctx) =>
      ctx.isJsonOutput ||
      ctx.noUpdateCheckEnv ||
      ctx.isUpgradeCommand ||
      (ctx.isNonInteractive && !ctx.isAgentSession) ||
      (!ctx.isStderrTTY && !ctx.isAgentSession),
    notificationMessage: (_method, current, latest, audience = "human") =>
      audience === "agent"
        ? `AXM_UPDATE_AVAILABLE current=${current} latest=${latest} command="axm upgrade"`
        : `Update available: ${current} \u2192 ${latest}\nRun: axm upgrade`,
  };

  return { layer: Layer.succeed(UpdateCheck, service), calls };
};

// =============================================================================
// Pure helpers
// =============================================================================

describe("isUpgradeCommand", () => {
  it("returns true for upgrade command", () => {
    expect(isUpgradeCommand(["upgrade"])).toBe(true);
  });

  it("returns true when upgrade is first arg with flags", () => {
    expect(isUpgradeCommand(["upgrade", "--force"])).toBe(true);
  });

  it("returns false when upgrade is not the first arg", () => {
    expect(isUpgradeCommand(["skills", "upgrade"])).toBe(false);
  });

  it("returns false for other commands", () => {
    expect(isUpgradeCommand(["skills", "list"])).toBe(false);
    expect(isUpgradeCommand(["init"])).toBe(false);
    expect(isUpgradeCommand([])).toBe(false);
  });
});

describe("buildSkipContext", () => {
  it("maps inputs correctly", () => {
    const ctx = buildSkipContext({
      args: ["skills", "list"],
      isNonInteractive: false,
      isJsonOutput: true,
      isStderrTTY: true,
    });
    expect(ctx.isJsonOutput).toBe(true);
    expect(ctx.isUpgradeCommand).toBe(false);
    expect(ctx.isNonInteractive).toBe(false);
    expect(ctx.isStderrTTY).toBe(true);
    expect(ctx.isAgentSession).toBe(false);
  });

  it("detects upgrade command", () => {
    const ctx = buildSkipContext({
      args: ["upgrade"],
      isNonInteractive: false,
      isJsonOutput: false,
      isStderrTTY: true,
    });
    expect(ctx.isUpgradeCommand).toBe(true);
  });

  it("defaults isStderrTTY to process.stderr.isTTY", () => {
    const ctx = buildSkipContext({
      args: [],
      isNonInteractive: false,
      isJsonOutput: false,
    });
    expect(ctx.isStderrTTY).toBe(process.stderr.isTTY === true);
  });

  it("maps agent session override", () => {
    const ctx = buildSkipContext({
      args: [],
      isNonInteractive: true,
      isJsonOutput: false,
      isAgentSession: true,
    });
    expect(ctx.isAgentSession).toBe(true);
  });
});

// =============================================================================
// withUpdateCheck integration
// =============================================================================

describe("withUpdateCheck", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-check-startup-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Notification behavior
  // ---------------------------------------------------------------------------

  it.effect("prints notification to stderr after command output when update is available", () => {
    const { printer, messages } = makeTestPrinter();
    const commandOutput: Array<string> = [];
    const commandProgram = Effect.sync(() => {
      commandOutput.push("command ran");
    });

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          // Command must have completed before notification
          expect(commandOutput).toEqual(["command ran"]);
          // Notification was printed
          expect(messages.length).toBe(1);
          expect(messages[0]).toContain("Update available");
          expect(messages[0]).toContain(LOCAL_VERSION);
          expect(messages[0]).toContain(REMOTE_VERSION);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("no notification when cache is missing (first run)", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({ tempDir });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(0);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("no notification when local version is up to date", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: LOCAL_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(0);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("notification includes method-aware install command for Script", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
      method: new Script({ execPath: "/usr/local/bin/axm" }),
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(1);
          expect(messages[0]).toContain("axm upgrade");
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("notification includes method-aware install command for Homebrew", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
      method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(1);
          expect(messages[0]).toContain("brew upgrade agentxm/tap/axm");
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("notification includes method-aware install command for Npm", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
      method: new Npm({ importUrl: "file:///node_modules/@axm.sh/cli" }),
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(1);
          expect(messages[0]).toContain("npm update -g @axm.sh/cli");
        }),
      ),
      Effect.provide(layer),
    );
  });

  // ---------------------------------------------------------------------------
  // Skip conditions
  // ---------------------------------------------------------------------------

  it.effect("skips when --json flag is set", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: { ...baseInputs, isJsonOutput: true },
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(0);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("skips when non-interactive mode", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: { ...baseInputs, isNonInteractive: true },
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(0);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("does not skip when non-interactive mode is an agent session", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: { ...baseInputs, isNonInteractive: true, isAgentSession: true },
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(1);
          expect(messages[0]).toContain("AXM_UPDATE_AVAILABLE");
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("skips when command is upgrade", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: { ...baseInputs, args: ["upgrade"] },
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(0);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("skips when stderr is not a TTY", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: { ...baseInputs, isStderrTTY: false },
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(0);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("does not skip when stderr is not a TTY for an agent session", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    const layer = makeTestLayers({
      tempDir,
      cacheData: { latestVersion: REMOTE_VERSION, checkedAt: freshTimestamp() },
    });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: { ...baseInputs, isStderrTTY: false, isAgentSession: true },
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messages.length).toBe(1);
          expect(messages[0]).toContain("AXM_UPDATE_AVAILABLE");
        }),
      ),
      Effect.provide(layer),
    );
  });

  // ---------------------------------------------------------------------------
  // Detached fiber behavior (verified via tracking mock)
  // ---------------------------------------------------------------------------

  it.effect("spawns refresh when cache is missing (no notification on first run)", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    // Use tracking mock that reports cache as "none" (missing)
    const { layer: trackingLayer, calls } = makeTrackingUpdateCheck({
      cacheResult: "none",
      updateAvailable: false,
    });
    const installMethodLayer = makeMockInstallMethod(new Unknown());
    const httpClientLayer = makeSuccessHttpClient();
    const { layer: rendererLayer } = TestRenderer.make();
    const layer = Layer.mergeAll(
      trackingLayer,
      installMethodLayer,
      httpClientLayer,
      rendererLayer,
      NodeServices.layer,
    );

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          // readCache was called
          expect(calls.readCache).toBe(1);
          // isUpdateAvailable was NOT called (cache is missing)
          expect(calls.isUpdateAvailable).toBe(0);
          // No notification on first run
          expect(messages.length).toBe(0);
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("reads cache and checks for update when cache is fresh", () => {
    const { printer, messages } = makeTestPrinter();
    const commandProgram = Effect.void;

    // Use tracking mock that reports cache as "fresh" with update available
    const { layer: trackingLayer, calls } = makeTrackingUpdateCheck({
      cacheResult: "fresh",
      updateAvailable: true,
    });
    const installMethodLayer = makeMockInstallMethod(new Unknown());
    const httpClientLayer = makeSuccessHttpClient();
    const { layer: rendererLayer } = TestRenderer.make();
    const layer = Layer.mergeAll(
      trackingLayer,
      installMethodLayer,
      httpClientLayer,
      rendererLayer,
      NodeServices.layer,
    );

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          // readCache was called
          expect(calls.readCache).toBe(1);
          // isUpdateAvailable was called (cache exists)
          expect(calls.isUpdateAvailable).toBe(1);
          // Notification was shown
          expect(messages.length).toBe(1);
        }),
      ),
      Effect.provide(layer),
    );
  });

  // ---------------------------------------------------------------------------
  // Command passthrough
  // ---------------------------------------------------------------------------

  it.effect("passes through command errors", () => {
    const { printer } = makeTestPrinter();
    const commandProgram = Effect.fail("command-error" as const);

    const layer = makeTestLayers({ tempDir });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.catch((e: string) => Effect.succeed({ caught: e })),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ caught: "command-error" });
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("returns command result when no notification", () => {
    const { printer } = makeTestPrinter();
    const commandProgram = Effect.succeed(42);

    const layer = makeTestLayers({ tempDir });

    return withUpdateCheck(commandProgram, {
      localVersion: LOCAL_VERSION,
      inputs: baseInputs,
      printNotification: printer,
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toBe(42);
        }),
      ),
      Effect.provide(layer),
    );
  });
});

// =============================================================================
// refreshCache
// =============================================================================

describe("refreshCache", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-check-refresh-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("writes cache after successful fetch", () => {
    const cachePath = path.join(tempDir, "update-check.json");
    const layer = Layer.mergeAll(
      UpdateCheckTest(cachePath).pipe(Layer.provide(NodeServices.layer)),
      makeSuccessHttpClient("0.3.0"),
      NodeServices.layer,
    );

    return refreshCache(LOCAL_VERSION).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          const cacheContent: unknown = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
          expect(cacheContent).toHaveProperty("latestVersion", "0.3.0");
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("silently ignores network errors", () => {
    const cachePath = path.join(tempDir, "update-check.json");
    const errorHttpClient = makeMockHttpClient(() => {
      return new Response("Server Error", { status: 500 });
    });
    const layer = Layer.mergeAll(
      UpdateCheckTest(cachePath).pipe(Layer.provide(NodeServices.layer)),
      errorHttpClient,
      NodeServices.layer,
    );

    return refreshCache(LOCAL_VERSION).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          // Cache should not exist
          expect(fs.existsSync(cachePath)).toBe(false);
        }),
      ),
      Effect.provide(layer),
    );
  });
});

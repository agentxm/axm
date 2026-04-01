/**
 * Unit tests for UpdateCheck service.
 *
 * Covers: cache read (fresh, stale, missing, invalid), cache write,
 * skip conditions, and install-method-aware notification messages.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, afterEach, beforeEach } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Homebrew, Npm, Script, Unknown } from "../install-method/index.js";

import {
  type SkipCheckContext,
  UpdateCheck,
  UpdateCheckTest,
  isCacheStale,
  notificationMessage,
  readCacheFromPath,
  shouldSkip,
  writeCacheToPath,
  isUpdateAvailableFromPath,
} from "./update-check.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const freshTimestamp = () => new Date().toISOString();

const staleTimestamp = () => {
  const d = new Date();
  d.setTime(d.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
  return d.toISOString();
};

const baseSkipContext: SkipCheckContext = {
  isJsonOutput: false,
  noUpdateCheckEnv: false,
  isUpgradeCommand: false,
  isNonInteractive: false,
  isStderrTTY: true,
};

// =============================================================================
// isCacheStale (pure)
// =============================================================================

describe("isCacheStale", () => {
  it("returns false for a recent timestamp", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60 * 1000).toISOString(); // 1 minute ago
    expect(isCacheStale(recent, now)).toBe(false);
  });

  it("returns true for a timestamp older than 24 hours", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    expect(isCacheStale(old, now)).toBe(true);
  });

  it("returns true for an invalid date string", () => {
    expect(isCacheStale("not-a-date", new Date())).toBe(true);
  });

  it("returns false for exactly 24 hours ago (boundary)", () => {
    const now = new Date();
    const boundary = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(isCacheStale(boundary, now)).toBe(false);
  });

  it("returns true for just over 24 hours ago", () => {
    const now = new Date();
    const justOver = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1).toISOString();
    expect(isCacheStale(justOver, now)).toBe(true);
  });
});

// =============================================================================
// shouldSkip (pure)
// =============================================================================

describe("shouldSkip", () => {
  it("returns false when no skip conditions are met", () => {
    expect(shouldSkip(baseSkipContext)).toBe(false);
  });

  it("returns true when --json flag is set", () => {
    expect(shouldSkip({ ...baseSkipContext, isJsonOutput: true })).toBe(true);
  });

  it("returns true when AXM_NO_UPDATE_CHECK=1", () => {
    expect(shouldSkip({ ...baseSkipContext, noUpdateCheckEnv: true })).toBe(true);
  });

  it("returns true when command is axm upgrade", () => {
    expect(shouldSkip({ ...baseSkipContext, isUpgradeCommand: true })).toBe(true);
  });

  it("returns true when non-interactive mode", () => {
    expect(shouldSkip({ ...baseSkipContext, isNonInteractive: true })).toBe(true);
  });

  it("returns true when stderr is not a TTY", () => {
    expect(shouldSkip({ ...baseSkipContext, isStderrTTY: false })).toBe(true);
  });

  it("returns true when multiple skip conditions are met", () => {
    expect(
      shouldSkip({
        isJsonOutput: true,
        noUpdateCheckEnv: true,
        isUpgradeCommand: false,
        isNonInteractive: false,
        isStderrTTY: true,
      }),
    ).toBe(true);
  });
});

// =============================================================================
// notificationMessage (pure)
// =============================================================================

describe("notificationMessage", () => {
  it("returns script message for Script method", () => {
    const msg = notificationMessage(new Script({ execPath: "/bin/axm" }), "0.1.0", "0.2.0");
    expect(msg).toBe("Update available: 0.1.0 \u2192 0.2.0\nRun: axm upgrade");
  });

  it("returns homebrew message for Homebrew method", () => {
    const msg = notificationMessage(
      new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
      "0.1.0",
      "0.2.0",
    );
    expect(msg).toBe("Update available: 0.1.0 \u2192 0.2.0\nRun: brew upgrade agentxm/tap/axm");
  });

  it("returns npm message for Npm method", () => {
    const msg = notificationMessage(
      new Npm({ importUrl: "file:///lib/node_modules/axm" }),
      "0.1.0",
      "0.2.0",
    );
    expect(msg).toBe("Update available: 0.1.0 \u2192 0.2.0\nRun: npm update -g @axm.sh/cli");
  });

  it("returns script message for Unknown method", () => {
    const msg = notificationMessage(new Unknown(), "0.1.0", "0.2.0");
    expect(msg).toBe("Update available: 0.1.0 \u2192 0.2.0\nRun: axm upgrade");
  });
});

// =============================================================================
// readCacheFromPath (effectful)
// =============================================================================

describe("readCacheFromPath", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "update-check-test-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("returns None when cache file does not exist", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const result = yield* readCacheFromPath(cachePath);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns Some for a fresh cache file", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const data = { latestVersion: "0.2.0", checkedAt: freshTimestamp() };
      nodeFs.writeFileSync(cachePath, JSON.stringify(data));

      const result = yield* readCacheFromPath(cachePath);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.latestVersion).toBe("0.2.0");
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None for a stale cache file (older than 24 hours)", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const data = { latestVersion: "0.2.0", checkedAt: staleTimestamp() };
      nodeFs.writeFileSync(cachePath, JSON.stringify(data));

      const result = yield* readCacheFromPath(cachePath);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None for invalid JSON", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      nodeFs.writeFileSync(cachePath, "not valid json {{{");

      const result = yield* readCacheFromPath(cachePath);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None for JSON with wrong schema", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      nodeFs.writeFileSync(cachePath, JSON.stringify({ foo: "bar" }));

      const result = yield* readCacheFromPath(cachePath);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None for empty file", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      nodeFs.writeFileSync(cachePath, "");

      const result = yield* readCacheFromPath(cachePath);
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

// =============================================================================
// writeCacheToPath (effectful)
// =============================================================================

describe("writeCacheToPath", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "update-check-test-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("writes cache file with correct structure", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      yield* writeCacheToPath(cachePath, "0.3.0");

      const content = nodeFs.readFileSync(cachePath, "utf-8");
      const parsed: unknown = JSON.parse(content);
      expect(parsed).toHaveProperty("latestVersion", "0.3.0");
      expect(parsed).toHaveProperty("checkedAt");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("creates parent directories if needed", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "nested", "dir", "update-check.json");
      yield* writeCacheToPath(cachePath, "0.3.0");

      expect(nodeFs.existsSync(cachePath)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("written cache is readable", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      yield* writeCacheToPath(cachePath, "0.5.0");

      const result = yield* readCacheFromPath(cachePath);
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.latestVersion).toBe("0.5.0");
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

// =============================================================================
// isUpdateAvailableFromPath (effectful)
// =============================================================================

describe("isUpdateAvailableFromPath", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "update-check-test-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("returns Some when local version is older", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const data = { latestVersion: "0.3.0", checkedAt: freshTimestamp() };
      nodeFs.writeFileSync(cachePath, JSON.stringify(data));

      const result = yield* isUpdateAvailableFromPath(cachePath, "0.2.0");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.current).toBe("0.2.0");
        expect(result.value.latest).toBe("0.3.0");
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None when local version is same", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const data = { latestVersion: "0.3.0", checkedAt: freshTimestamp() };
      nodeFs.writeFileSync(cachePath, JSON.stringify(data));

      const result = yield* isUpdateAvailableFromPath(cachePath, "0.3.0");
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None when local version is newer", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const data = { latestVersion: "0.3.0", checkedAt: freshTimestamp() };
      nodeFs.writeFileSync(cachePath, JSON.stringify(data));

      const result = yield* isUpdateAvailableFromPath(cachePath, "1.0.0");
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None when cache is missing", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "nonexistent.json");
      const result = yield* isUpdateAvailableFromPath(cachePath, "0.2.0");
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None when cache is stale", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const data = { latestVersion: "0.3.0", checkedAt: staleTimestamp() };
      nodeFs.writeFileSync(cachePath, JSON.stringify(data));

      const result = yield* isUpdateAvailableFromPath(cachePath, "0.2.0");
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns None for invalid version strings", () =>
    Effect.gen(function* () {
      const cachePath = nodePath.join(tempDir, "update-check.json");
      const data = { latestVersion: "not-semver", checkedAt: freshTimestamp() };
      nodeFs.writeFileSync(cachePath, JSON.stringify(data));

      const result = yield* isUpdateAvailableFromPath(cachePath, "0.2.0");
      expect(Option.isNone(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

// =============================================================================
// Service integration via UpdateCheckTest layer
// =============================================================================

describe("UpdateCheck service via UpdateCheckTest layer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "update-check-svc-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("readCache returns None when no cache exists", () =>
    Effect.gen(function* () {
      const service = yield* UpdateCheck;
      const result = yield* service.readCache();
      expect(Option.isNone(result)).toBe(true);
    }).pipe(
      Effect.provide(
        UpdateCheckTest(nodePath.join(tempDir, "update-check.json")).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  );

  it.effect("writeCache then readCache round-trips correctly", () =>
    Effect.gen(function* () {
      const service = yield* UpdateCheck;
      yield* service.writeCache("1.0.0");
      const result = yield* service.readCache();
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.latestVersion).toBe("1.0.0");
      }
    }).pipe(
      Effect.provide(
        UpdateCheckTest(nodePath.join(tempDir, "update-check.json")).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  );

  it.effect("isUpdateAvailable returns Some when update exists", () =>
    Effect.gen(function* () {
      const service = yield* UpdateCheck;
      yield* service.writeCache("2.0.0");
      const result = yield* service.isUpdateAvailable("1.0.0");
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.current).toBe("1.0.0");
        expect(result.value.latest).toBe("2.0.0");
      }
    }).pipe(
      Effect.provide(
        UpdateCheckTest(nodePath.join(tempDir, "update-check.json")).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  );

  it.effect("shouldSkip delegates to pure function", () =>
    Effect.gen(function* () {
      const service = yield* UpdateCheck;
      expect(service.shouldSkip(baseSkipContext)).toBe(false);
      expect(service.shouldSkip({ ...baseSkipContext, isJsonOutput: true })).toBe(true);
    }).pipe(
      Effect.provide(
        UpdateCheckTest(nodePath.join(tempDir, "update-check.json")).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  );

  it.effect("notificationMessage delegates to pure function", () =>
    Effect.gen(function* () {
      const service = yield* UpdateCheck;
      const msg = service.notificationMessage(
        new Script({ execPath: "/bin/axm" }),
        "0.1.0",
        "0.2.0",
      );
      expect(msg).toContain("axm upgrade");
    }).pipe(
      Effect.provide(
        UpdateCheckTest(nodePath.join(tempDir, "update-check.json")).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  );
});

/**
 * Unit tests for InstallMeta service.
 *
 * Tests reading (file exists, file missing, invalid JSON) and writing
 * (creates file, overwrites existing) of `install-meta.json`.
 */

import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, afterEach, beforeEach } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  type InstallMetaData,
  InstallMeta,
  InstallMetaLive,
  InstallMetaTest,
  readInstallMeta,
  writeInstallMeta,
} from "./install-meta.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

const withContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

// -----------------------------------------------------------------------------
// readInstallMeta
// -----------------------------------------------------------------------------

describe("InstallMeta", () => {
  let tempDir: string;
  let dataDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "install-meta-test-"));
    dataDir = nodePath.join(tempDir, ".axm");
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("readInstallMeta", () => {
    it.effect("returns None when file does not exist", () =>
      withContext(
        Effect.gen(function* () {
          const result = yield* readInstallMeta(dataDir);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("returns Some with valid data when file exists", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dataDir, "install-meta.json"),
            JSON.stringify({ method: "script", installedAt: "2026-03-31T12:00:00.000Z" }),
          );

          const result = yield* readInstallMeta(dataDir);
          expect(Option.isSome(result)).toBe(true);
          const value = Option.getOrThrow(result);
          expect(value.method).toBe("script");
          expect(value.schemaVersion).toBe(2);
          expect(DateTime.formatIso(value.installedAt)).toBe("2026-03-31T12:00:00.000Z");
        }),
      ),
    );

    it.effect("returns None for invalid JSON", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(nodePath.join(dataDir, "install-meta.json"), "not valid json {{{");

          const result = yield* readInstallMeta(dataDir);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("returns None for valid JSON with missing fields", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dataDir, "install-meta.json"),
            JSON.stringify({ method: "script" }),
          );

          const result = yield* readInstallMeta(dataDir);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("returns None for valid JSON with wrong field types", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dataDir, "install-meta.json"),
            JSON.stringify({ method: 42, installedAt: true }),
          );

          const result = yield* readInstallMeta(dataDir);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("returns None for a malformed installedAt timestamp", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dataDir, "install-meta.json"),
            JSON.stringify({ method: "script", installedAt: "not-a-timestamp" }),
          );

          const result = yield* readInstallMeta(dataDir);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("reads homebrew method", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dataDir, "install-meta.json"),
            JSON.stringify({ method: "homebrew", installedAt: "2026-01-15T08:30:00.000Z" }),
          );

          const result = yield* readInstallMeta(dataDir);
          expect(Option.isSome(result)).toBe(true);
          const value = Option.getOrThrow(result);
          expect(value.method).toBe("homebrew");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // writeInstallMeta
  // ---------------------------------------------------------------------------

  describe("writeInstallMeta", () => {
    it.effect("creates file and directory when they do not exist", () =>
      withContext(
        Effect.gen(function* () {
          const meta: InstallMetaData = {
            method: "script",
            installedAt: DateTime.makeUnsafe("2026-03-31T12:00:00.000Z"),
          };
          yield* writeInstallMeta(dataDir, meta);

          // Verify file was written
          const filePath = nodePath.join(dataDir, "install-meta.json");
          expect(nodeFs.existsSync(filePath)).toBe(true);

          const content = nodeFs.readFileSync(filePath, "utf-8");
          const parsed: unknown = JSON.parse(content);
          expect(parsed).toEqual({
            schemaVersion: 2,
            method: "script",
            installedAt: "2026-03-31T12:00:00.000Z",
          });
        }),
      ),
    );

    it.effect("overwrites existing file", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dataDir, "install-meta.json"),
            JSON.stringify({ method: "script", installedAt: "2025-01-01T00:00:00.000Z" }),
          );

          const meta: InstallMetaData = {
            method: "homebrew",
            installedAt: DateTime.makeUnsafe("2026-06-15T18:00:00.000Z"),
          };
          yield* writeInstallMeta(dataDir, meta);

          const content = nodeFs.readFileSync(nodePath.join(dataDir, "install-meta.json"), "utf-8");
          const parsed: unknown = JSON.parse(content);
          expect(parsed).toEqual({
            schemaVersion: 2,
            method: "homebrew",
            installedAt: "2026-06-15T18:00:00.000Z",
          });
        }),
      ),
    );

    it.effect("written file can be read back", () =>
      withContext(
        Effect.gen(function* () {
          const meta: InstallMetaData = {
            method: "npm",
            installedAt: DateTime.makeUnsafe("2026-03-31T12:00:00.000Z"),
          };
          yield* writeInstallMeta(dataDir, meta);

          const result = yield* readInstallMeta(dataDir);
          expect(Option.isSome(result)).toBe(true);
          const value = Option.getOrThrow(result);
          expect(value.method).toBe("npm");
          expect(DateTime.formatIso(value.installedAt)).toBe("2026-03-31T12:00:00.000Z");
        }),
      ),
    );

    it.effect("atomically persists package-manager ownership evidence", () =>
      withContext(
        Effect.gen(function* () {
          yield* writeInstallMeta(dataDir, {
            method: "pnpm",
            installedAt: DateTime.makeUnsafe("2026-03-31T12:00:00.000Z"),
            packageName: "axm.sh",
            managerMajorVersion: 10,
            executablePath: "/tmp/pnpm/bin/axm",
          });

          const result = Option.getOrThrow(yield* readInstallMeta(dataDir));
          expect(result).toMatchObject({
            schemaVersion: 2,
            method: "pnpm",
            packageName: "axm.sh",
            managerMajorVersion: 10,
            executablePath: "/tmp/pnpm/bin/axm",
          });
          expect(nodeFs.readdirSync(dataDir)).toEqual(["install-meta.json"]);
        }),
      ),
    );

    it.effect("reads legacy metadata and normalizes it to schema version 2", () =>
      withContext(
        Effect.gen(function* () {
          nodeFs.mkdirSync(dataDir, { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(dataDir, "install-meta.json"),
            JSON.stringify({ method: "npm", installedAt: "2026-01-15T08:30:00.000Z" }),
          );

          const result = Option.getOrThrow(yield* readInstallMeta(dataDir));
          expect(result.schemaVersion).toBe(2);
          expect(result.method).toBe("npm");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Service via InstallMetaTest layer
  // ---------------------------------------------------------------------------

  describe("Service via InstallMetaTest layer", () => {
    it.effect("read returns None when file does not exist", () =>
      Effect.gen(function* () {
        const service = yield* InstallMeta;
        const result = yield* service.read();
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(InstallMetaTest(dataDir).pipe(Layer.provide(NodeServices.layer)))),
    );

    it.effect("write then read round-trips data", () =>
      Effect.gen(function* () {
        const service = yield* InstallMeta;
        const meta: InstallMetaData = {
          method: "script",
          installedAt: DateTime.makeUnsafe("2026-03-31T12:00:00.000Z"),
        };
        yield* service.write(meta);
        const result = yield* service.read();
        expect(Option.isSome(result)).toBe(true);
        const value = Option.getOrThrow(result);
        expect(value.method).toBe("script");
        expect(DateTime.formatIso(value.installedAt)).toBe("2026-03-31T12:00:00.000Z");
      }).pipe(Effect.provide(InstallMetaTest(dataDir).pipe(Layer.provide(NodeServices.layer)))),
    );

    it.effect("write overwrites previous data through service", () =>
      Effect.gen(function* () {
        const service = yield* InstallMeta;

        yield* service.write({
          method: "script",
          installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
        });

        yield* service.write({
          method: "homebrew",
          installedAt: DateTime.makeUnsafe("2026-06-15T18:00:00.000Z"),
        });

        const result = yield* service.read();
        expect(Option.isSome(result)).toBe(true);
        const value = Option.getOrThrow(result);
        expect(value.method).toBe("homebrew");
        expect(DateTime.formatIso(value.installedAt)).toBe("2026-06-15T18:00:00.000Z");
      }).pipe(Effect.provide(InstallMetaTest(dataDir).pipe(Layer.provide(NodeServices.layer)))),
    );
  });

  describe("InstallMetaLive", () => {
    it.effect("writes under AXM_USER_HOME", () =>
      Effect.gen(function* () {
        const service = yield* InstallMeta;
        yield* service.write({
          method: "script",
          installedAt: DateTime.makeUnsafe("2026-03-31T12:00:00.000Z"),
        });

        const filePath = nodePath.join(tempDir, ".axm", "install-meta.json");
        expect(nodeFs.existsSync(filePath)).toBe(true);
      }).pipe(
        Effect.provide(
          InstallMetaLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                NodeServices.layer,
                ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: tempDir } })),
              ),
            ),
          ),
        ),
      ),
    );
  });
});

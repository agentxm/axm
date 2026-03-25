/**
 * Unit tests for environment detection functions.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { CliEnvConfig, type CliEnvConfigService } from "../config/index.js";
import { detectCI, detectContainer, detectRoot, detectSSH, detectWSL } from "./environment.js";

/**
 * Creates a mock FileSystem layer for testing.
 */
const mockFileSystem = (overrides: {
  exists?: (path: string) => boolean;
  readFileString?: (path: string) => string;
}) =>
  Layer.succeed(FileSystem.FileSystem, {
    exists: (path: string) =>
      Effect.succeed(overrides.exists?.(path) ?? false) as ReturnType<
        FileSystem.FileSystem["exists"]
      >,
    readFileString: (path: string) => {
      const content = overrides.readFileString?.(path);
      return (
        content !== undefined
          ? Effect.succeed(content)
          : Effect.fail({ _tag: "SystemError", reason: "NotFound", message: "Not found" } as const)
      ) as ReturnType<FileSystem.FileSystem["readFileString"]>;
    },
  } as FileSystem.FileSystem);

/**
 * Creates a CliEnvConfig test layer with overrides.
 */
const makeTestConfig = (overrides: Partial<CliEnvConfigService> = {}): Layer.Layer<CliEnvConfig> =>
  Layer.succeed(CliEnvConfig, {
    registryUrl: "https://registry.agentxm.ai",
    token: Option.none(),
    ci: false,
    doNotTrack: Option.none(),
    telemetry: Option.none(),
    sshClient: Option.none(),
    sshTty: Option.none(),
    xdgConfigHome: Option.none(),
    claudeSkillsDir: Option.none(),
    geminiCliSkillsDir: Option.none(),
    installInternalSkills: Option.none(),
    vitest: "false",
    home: Option.none(),
    userProfile: Option.none(),
    homePath: Option.none(),
    verbose: Option.none(),
    debug: Option.none(),
    telemetryBaseUrl: Option.none(),
    ...overrides,
  } satisfies CliEnvConfigService);

describe("Environment detection", () => {
  describe("detectSSH", () => {
    it("returns true when SSH_CLIENT is set", async () => {
      const layer = makeTestConfig({ sshClient: Option.some("192.168.1.1 12345 22") });
      const result = await Effect.runPromise(detectSSH.pipe(Effect.provide(layer)));
      expect(result).toBe(true);
    });

    it("returns true when SSH_TTY is set", async () => {
      const layer = makeTestConfig({ sshTty: Option.some("/dev/pts/0") });
      const result = await Effect.runPromise(detectSSH.pipe(Effect.provide(layer)));
      expect(result).toBe(true);
    });

    it("returns false when neither SSH var is set", async () => {
      const layer = makeTestConfig();
      const result = await Effect.runPromise(detectSSH.pipe(Effect.provide(layer)));
      expect(result).toBe(false);
    });
  });

  describe("detectContainer", () => {
    it("returns true when /.dockerenv exists", async () => {
      const layer = mockFileSystem({ exists: (p) => p === "/.dockerenv" });
      const result = await Effect.runPromise(detectContainer.pipe(Effect.provide(layer)));

      expect(result).toBe(true);
    });

    it("returns true when /.containerenv exists", async () => {
      const layer = mockFileSystem({ exists: (p) => p === "/.containerenv" });
      const result = await Effect.runPromise(detectContainer.pipe(Effect.provide(layer)));

      expect(result).toBe(true);
    });

    it("returns false when neither exists", async () => {
      const layer = mockFileSystem({ exists: () => false });
      const result = await Effect.runPromise(detectContainer.pipe(Effect.provide(layer)));

      expect(result).toBe(false);
    });
  });

  describe("detectWSL", () => {
    it("returns true when /proc/version contains microsoft", async () => {
      const layer = mockFileSystem({
        exists: (p) => p === "/proc/version",
        readFileString: () => "Linux version 5.10.16.3-microsoft-standard-WSL2 (oe-user@oe-host)",
      });
      const result = await Effect.runPromise(detectWSL.pipe(Effect.provide(layer)));

      expect(result).toBe(true);
    });

    it("returns true case-insensitively", async () => {
      const layer = mockFileSystem({
        exists: (p) => p === "/proc/version",
        readFileString: () => "Linux version 5.10.16.3-Microsoft-standard",
      });
      const result = await Effect.runPromise(detectWSL.pipe(Effect.provide(layer)));

      expect(result).toBe(true);
    });

    it("returns false when /proc/version does not contain microsoft", async () => {
      const layer = mockFileSystem({
        exists: (p) => p === "/proc/version",
        readFileString: () => "Linux version 5.10.0-generic (builder@buildhost)",
      });
      const result = await Effect.runPromise(detectWSL.pipe(Effect.provide(layer)));

      expect(result).toBe(false);
    });

    it("returns false when /proc/version does not exist", async () => {
      const layer = mockFileSystem({ exists: () => false });
      const result = await Effect.runPromise(detectWSL.pipe(Effect.provide(layer)));

      expect(result).toBe(false);
    });
  });

  describe("detectCI", () => {
    it("returns true when CI=true", async () => {
      const layer = makeTestConfig({ ci: true });
      const result = await Effect.runPromise(detectCI.pipe(Effect.provide(layer)));
      expect(result).toBe(true);
    });

    it("returns false when CI is not set", async () => {
      const layer = makeTestConfig({ ci: false });
      const result = await Effect.runPromise(detectCI.pipe(Effect.provide(layer)));
      expect(result).toBe(false);
    });

    it("returns false when CI is not true", async () => {
      const layer = makeTestConfig({ ci: false });
      const result = await Effect.runPromise(detectCI.pipe(Effect.provide(layer)));
      expect(result).toBe(false);
    });
  });

  describe("detectRoot", () => {
    it("returns true when getuid returns 0", () => {
      const originalGetuid = process.getuid;
      Object.defineProperty(process, "getuid", { value: () => 0, configurable: true });
      try {
        const result = Effect.runSync(detectRoot);
        expect(result).toBe(true);
      } finally {
        Object.defineProperty(process, "getuid", { value: originalGetuid, configurable: true });
      }
    });

    it("returns false when getuid returns non-zero", () => {
      const originalGetuid = process.getuid;
      Object.defineProperty(process, "getuid", { value: () => 1000, configurable: true });
      try {
        const result = Effect.runSync(detectRoot);
        expect(result).toBe(false);
      } finally {
        Object.defineProperty(process, "getuid", { value: originalGetuid, configurable: true });
      }
    });

    it("returns false when getuid is not available", () => {
      const originalGetuid = process.getuid;
      Object.defineProperty(process, "getuid", { value: undefined, configurable: true });
      try {
        const result = Effect.runSync(detectRoot);
        expect(result).toBe(false);
      } finally {
        Object.defineProperty(process, "getuid", { value: originalGetuid, configurable: true });
      }
    });
  });
});

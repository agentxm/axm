/**
 * Unit tests for environment detection functions.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectContainer, detectRoot, detectSSH, detectWSL } from "./environment.js";

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

describe("Environment detection", () => {
  describe("detectSSH", () => {
    let origSshClient: string | undefined;
    let origSshTty: string | undefined;

    beforeEach(() => {
      origSshClient = process.env["SSH_CLIENT"];
      origSshTty = process.env["SSH_TTY"];
      delete process.env["SSH_CLIENT"];
      delete process.env["SSH_TTY"];
    });

    afterEach(() => {
      if (origSshClient !== undefined) process.env["SSH_CLIENT"] = origSshClient;
      else delete process.env["SSH_CLIENT"];
      if (origSshTty !== undefined) process.env["SSH_TTY"] = origSshTty;
      else delete process.env["SSH_TTY"];
    });

    it("returns true when SSH_CLIENT is set", async () => {
      process.env["SSH_CLIENT"] = "192.168.1.1 12345 22";
      const result = await Effect.runPromise(detectSSH);
      expect(result).toBe(true);
    });

    it("returns true when SSH_TTY is set", async () => {
      process.env["SSH_TTY"] = "/dev/pts/0";
      const result = await Effect.runPromise(detectSSH);
      expect(result).toBe(true);
    });

    it("returns false when neither SSH var is set", async () => {
      const result = await Effect.runPromise(detectSSH);
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

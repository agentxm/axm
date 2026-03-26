import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCI,
  isContainer,
  isNonInteractive,
  isRoot,
  isSSH,
  isWSL,
  nonInteractiveFlag,
} from "./environment.js";

// ---------------------------------------------------------------------------
// Mock FileSystem for container/WSL tests
// ---------------------------------------------------------------------------

const mockFileSystem = (overrides: {
  exists?: (path: string) => boolean;
  readFileString?: (path: string) => string;
}) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const overridesLayer = {
        exists: (path: string) => Effect.succeed(overrides.exists?.(path) ?? false),
        readFileString: (path: string) => {
          const content = overrides.readFileString?.(path);
          return content !== undefined
            ? Effect.succeed(content)
            : fileSystem.readFileString("/definitely-missing-environment-test-path");
        },
      } satisfies Pick<FileSystem.FileSystem, "exists" | "readFileString">;

      return {
        ...fileSystem,
        ...overridesLayer,
      } satisfies FileSystem.FileSystem;
    }),
  ).pipe(Layer.provide(NodeServices.layer));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Environment detection", () => {
  describe("isCI", () => {
    let origCI: string | undefined;

    beforeEach(() => {
      origCI = process.env["CI"];
      delete process.env["CI"];
    });

    afterEach(() => {
      if (origCI !== undefined) process.env["CI"] = origCI;
      else delete process.env["CI"];
    });

    it("returns true when CI=true", async () => {
      process.env["CI"] = "true";
      expect(await Effect.runPromise(isCI)).toBe(true);
    });

    it("returns false when CI is not set", async () => {
      expect(await Effect.runPromise(isCI)).toBe(false);
    });

    it("returns false when CI is not 'true'", async () => {
      process.env["CI"] = "false";
      expect(await Effect.runPromise(isCI)).toBe(false);
    });
  });

  describe("isNonInteractive", () => {
    const originalStdin = process.stdin;
    let origCI: string | undefined;

    const run = (flagValue: Option.Option<boolean>) =>
      Effect.runPromise(
        isNonInteractive.pipe(Effect.provide(Layer.succeed(nonInteractiveFlag, flagValue))),
      );

    beforeEach(() => {
      origCI = process.env["CI"];
      delete process.env["CI"];
    });

    afterEach(() => {
      if (origCI !== undefined) process.env["CI"] = origCI;
      else delete process.env["CI"];
      Object.defineProperty(process, "stdin", { value: originalStdin });
    });

    it("returns true when flag is explicitly true", async () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(await run(Option.some(true))).toBe(true);
    });

    it("returns false when flag is explicitly false (even in CI)", async () => {
      process.env["CI"] = "true";
      expect(await run(Option.some(false))).toBe(false);
    });

    it("falls back to true when CI=true and no flag", async () => {
      process.env["CI"] = "true";
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(await run(Option.none())).toBe(true);
    });

    it("falls back to true when stdin is not a TTY and no flag", async () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: false },
        configurable: true,
      });
      expect(await run(Option.none())).toBe(true);
    });

    it("falls back to false when not CI and stdin is a TTY and no flag", async () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(await run(Option.none())).toBe(false);
    });
  });

  describe("isSSH", () => {
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
      expect(await Effect.runPromise(isSSH)).toBe(true);
    });

    it("returns true when SSH_TTY is set", async () => {
      process.env["SSH_TTY"] = "/dev/pts/0";
      expect(await Effect.runPromise(isSSH)).toBe(true);
    });

    it("returns false when neither SSH var is set", async () => {
      expect(await Effect.runPromise(isSSH)).toBe(false);
    });
  });

  describe("isRoot", () => {
    it("returns true when getuid returns 0", () => {
      const originalGetuid = process.getuid;
      Object.defineProperty(process, "getuid", { value: () => 0, configurable: true });
      try {
        expect(isRoot()).toBe(true);
      } finally {
        Object.defineProperty(process, "getuid", { value: originalGetuid, configurable: true });
      }
    });

    it("returns false when getuid returns non-zero", () => {
      const originalGetuid = process.getuid;
      Object.defineProperty(process, "getuid", { value: () => 1000, configurable: true });
      try {
        expect(isRoot()).toBe(false);
      } finally {
        Object.defineProperty(process, "getuid", { value: originalGetuid, configurable: true });
      }
    });

    it("returns false when getuid is not available", () => {
      const originalGetuid = process.getuid;
      Object.defineProperty(process, "getuid", { value: undefined, configurable: true });
      try {
        expect(isRoot()).toBe(false);
      } finally {
        Object.defineProperty(process, "getuid", { value: originalGetuid, configurable: true });
      }
    });
  });

  describe("isContainer", () => {
    it("returns true when /.dockerenv exists", async () => {
      const layer = mockFileSystem({ exists: (p) => p === "/.dockerenv" });
      const result = await Effect.runPromise(isContainer.pipe(Effect.provide(layer)));
      expect(result).toBe(true);
    });

    it("returns true when /.containerenv exists", async () => {
      const layer = mockFileSystem({ exists: (p) => p === "/.containerenv" });
      const result = await Effect.runPromise(isContainer.pipe(Effect.provide(layer)));
      expect(result).toBe(true);
    });

    it("returns false when neither exists", async () => {
      const layer = mockFileSystem({ exists: () => false });
      const result = await Effect.runPromise(isContainer.pipe(Effect.provide(layer)));
      expect(result).toBe(false);
    });
  });

  describe("isWSL", () => {
    it("returns true when /proc/version contains microsoft", async () => {
      const layer = mockFileSystem({
        exists: (p) => p === "/proc/version",
        readFileString: () => "Linux version 5.10.16.3-microsoft-standard-WSL2 (oe-user@oe-host)",
      });
      const result = await Effect.runPromise(isWSL.pipe(Effect.provide(layer)));
      expect(result).toBe(true);
    });

    it("returns true case-insensitively", async () => {
      const layer = mockFileSystem({
        exists: (p) => p === "/proc/version",
        readFileString: () => "Linux version 5.10.16.3-Microsoft-standard",
      });
      const result = await Effect.runPromise(isWSL.pipe(Effect.provide(layer)));
      expect(result).toBe(true);
    });

    it("returns false when /proc/version does not contain microsoft", async () => {
      const layer = mockFileSystem({
        exists: (p) => p === "/proc/version",
        readFileString: () => "Linux version 5.10.0-generic (builder@buildhost)",
      });
      const result = await Effect.runPromise(isWSL.pipe(Effect.provide(layer)));
      expect(result).toBe(false);
    });

    it("returns false when /proc/version does not exist", async () => {
      const layer = mockFileSystem({ exists: () => false });
      const result = await Effect.runPromise(isWSL.pipe(Effect.provide(layer)));
      expect(result).toBe(false);
    });
  });
});

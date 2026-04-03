import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { isContainer, isRoot, isSSH, isWSL } from "./environment.js";

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

    it.effect("returns true when SSH_CLIENT is set", () =>
      Effect.gen(function* () {
        process.env["SSH_CLIENT"] = "192.168.1.1 12345 22";
        expect(yield* isSSH).toBe(true);
      }),
    );

    it.effect("returns true when SSH_TTY is set", () =>
      Effect.gen(function* () {
        process.env["SSH_TTY"] = "/dev/pts/0";
        expect(yield* isSSH).toBe(true);
      }),
    );

    it.effect("returns false when neither SSH var is set", () =>
      Effect.gen(function* () {
        expect(yield* isSSH).toBe(false);
      }),
    );
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
    it.effect("returns true when /.dockerenv exists", () =>
      Effect.gen(function* () {
        const layer = mockFileSystem({ exists: (p) => p === "/.dockerenv" });
        const result = yield* isContainer.pipe(Effect.provide(layer));
        expect(result).toBe(true);
      }),
    );

    it.effect("returns true when /.containerenv exists", () =>
      Effect.gen(function* () {
        const layer = mockFileSystem({ exists: (p) => p === "/.containerenv" });
        const result = yield* isContainer.pipe(Effect.provide(layer));
        expect(result).toBe(true);
      }),
    );

    it.effect("returns false when neither exists", () =>
      Effect.gen(function* () {
        const layer = mockFileSystem({ exists: () => false });
        const result = yield* isContainer.pipe(Effect.provide(layer));
        expect(result).toBe(false);
      }),
    );
  });

  describe("isWSL", () => {
    it.effect("returns true when /proc/version contains microsoft", () =>
      Effect.gen(function* () {
        const layer = mockFileSystem({
          exists: (p) => p === "/proc/version",
          readFileString: () => "Linux version 5.10.16.3-microsoft-standard-WSL2 (oe-user@oe-host)",
        });
        const result = yield* isWSL.pipe(Effect.provide(layer));
        expect(result).toBe(true);
      }),
    );

    it.effect("returns true case-insensitively", () =>
      Effect.gen(function* () {
        const layer = mockFileSystem({
          exists: (p) => p === "/proc/version",
          readFileString: () => "Linux version 5.10.16.3-Microsoft-standard",
        });
        const result = yield* isWSL.pipe(Effect.provide(layer));
        expect(result).toBe(true);
      }),
    );

    it.effect("returns false when /proc/version does not contain microsoft", () =>
      Effect.gen(function* () {
        const layer = mockFileSystem({
          exists: (p) => p === "/proc/version",
          readFileString: () => "Linux version 5.10.0-generic (builder@buildhost)",
        });
        const result = yield* isWSL.pipe(Effect.provide(layer));
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false when /proc/version does not exist", () =>
      Effect.gen(function* () {
        const layer = mockFileSystem({ exists: () => false });
        const result = yield* isWSL.pipe(Effect.provide(layer));
        expect(result).toBe(false);
      }),
    );
  });
});

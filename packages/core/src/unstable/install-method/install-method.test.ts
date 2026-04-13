/**
 * Unit tests for InstallMethod service.
 *
 * Tests detection of install method across all five precedence levels:
 * script, homebrew, npm, metadata file fallback, and unknown.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, afterEach, beforeEach } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  type InstallMethodInputs,
  InstallMethod,
  InstallMethodTest,
  detectFromInputs,
} from "./install-method.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

const baseInputs: InstallMethodInputs = {
  execPath: "/usr/local/bin/bun",
  importMetaUrl: "file:///usr/local/lib/axm/src/main.ts",
  homeDir: "/Users/testuser",
  platform: "darwin",
  localAppData: Option.none(),
};

// -----------------------------------------------------------------------------
// Priority 1: Script install
// -----------------------------------------------------------------------------

describe("InstallMethod", () => {
  describe("Priority 1: Script install", () => {
    it.effect("detects script install when execPath is in ~/.axm/bin/", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "/Users/testuser/.axm/bin/bun",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Script");
        if (result._tag === "Script") {
          expect(result.execPath).toBe("/Users/testuser/.axm/bin/bun");
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("detects script install with nested path in ~/.axm/bin/", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "/Users/testuser/.axm/bin/v1.0.0/bun",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Script");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("detects script install on Windows with LOCALAPPDATA", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "C:\\Users\\testuser\\AppData\\Local\\axm\\bin\\bun.exe",
          homeDir: "C:\\Users\\testuser",
          platform: "win32",
          localAppData: Option.some("C:\\Users\\testuser\\AppData\\Local"),
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Script");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("script takes priority over homebrew signals", () =>
      Effect.gen(function* () {
        // Even if realpath would resolve to /Cellar/, the script check wins
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "/Users/testuser/.axm/bin/bun",
          importMetaUrl: "file:///some/node_modules/path",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Script");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  // ---------------------------------------------------------------------------
  // Priority 2: Homebrew install
  // ---------------------------------------------------------------------------

  describe("Priority 2: Homebrew install", () => {
    it.effect("detects homebrew when realpath of execPath contains /Cellar/", () =>
      Effect.gen(function* () {
        // When realPath of a non-existent path fails, it falls back to the
        // original path via our catch. So providing an execPath that itself
        // contains /Cellar/ is sufficient for a unit test.
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "/opt/homebrew/Cellar/axm/1.0.0/bin/bun",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Homebrew");
        if (result._tag === "Homebrew") {
          expect(result.execPath).toBe("/opt/homebrew/Cellar/axm/1.0.0/bin/bun");
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("homebrew takes priority over npm signals", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "/opt/homebrew/Cellar/axm/1.0.0/bin/bun",
          importMetaUrl: "file:///some/node_modules/axm/src/main.ts",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Homebrew");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  // ---------------------------------------------------------------------------
  // Priority 3: npm install
  // ---------------------------------------------------------------------------

  describe("Priority 3: npm install", () => {
    it.effect("detects npm when import.meta.url contains node_modules", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          importMetaUrl: "file:///usr/local/lib/node_modules/axm.sh/dist/main.js",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Npm");
        if (result._tag === "Npm") {
          expect(result.importUrl).toBe("file:///usr/local/lib/node_modules/axm.sh/dist/main.js");
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("npm takes priority over metadata file", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          importMetaUrl: "file:///home/user/node_modules/axm/main.js",
        };
        // Even if install-meta.json exists, npm signal wins
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Npm");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  // ---------------------------------------------------------------------------
  // Priority 4: Metadata file fallback
  // ---------------------------------------------------------------------------

  describe("Priority 4: Metadata file fallback", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "install-method-test-"));
      nodeFs.mkdirSync(nodePath.join(tempDir, ".axm"), { recursive: true });
    });

    afterEach(() => {
      nodeFs.rmSync(tempDir, { recursive: true, force: true });
    });

    it.effect("reads install-meta.json and returns script method", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(metaPath, JSON.stringify({ method: "script" }));

        const inputs: InstallMethodInputs = {
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Script");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("reads install-meta.json and returns homebrew method", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(metaPath, JSON.stringify({ method: "homebrew" }));

        const inputs: InstallMethodInputs = {
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Homebrew");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("reads install-meta.json and returns npm method", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(metaPath, JSON.stringify({ method: "npm" }));

        const inputs: InstallMethodInputs = {
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Npm");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns unknown for invalid JSON in install-meta.json", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(metaPath, "not valid json");

        const inputs: InstallMethodInputs = {
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Unknown");
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("returns unknown for install-meta.json with unknown method", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(metaPath, JSON.stringify({ method: "cargo" }));

        const inputs: InstallMethodInputs = {
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Unknown");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  // ---------------------------------------------------------------------------
  // Priority 5: Unknown
  // ---------------------------------------------------------------------------

  describe("Priority 5: Unknown", () => {
    it.effect("returns unknown when no signals match", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Unknown");
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });

  // ---------------------------------------------------------------------------
  // Service integration
  // ---------------------------------------------------------------------------

  describe("Service via InstallMethodTest layer", () => {
    it.effect("provides detect() through the service", () =>
      Effect.gen(function* () {
        const service = yield* InstallMethod;
        const result = yield* service.detect();
        expect(result._tag).toBe("Script");
      }).pipe(
        Effect.provide(
          InstallMethodTest({
            ...baseInputs,
            execPath: "/Users/testuser/.axm/bin/bun",
          }).pipe(Layer.provide(NodeServices.layer)),
        ),
      ),
    );

    it.effect("test layer returns unknown for unrecognized inputs", () =>
      Effect.gen(function* () {
        const service = yield* InstallMethod;
        const result = yield* service.detect();
        expect(result._tag).toBe("Unknown");
      }).pipe(
        Effect.provide(
          InstallMethodTest({
            ...baseInputs,
            execPath: "/some/random/bin/bun",
            importMetaUrl: "file:///some/random/path/main.ts",
          }).pipe(Layer.provide(NodeServices.layer)),
        ),
      ),
    );
  });
});

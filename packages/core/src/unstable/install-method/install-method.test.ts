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
import { describe, expect, afterEach, beforeEach, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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
};

// -----------------------------------------------------------------------------
// Priority 1: Script install
// -----------------------------------------------------------------------------

layer(NodeServices.layer, { excludeTestServices: true })("InstallMethod", (it) => {
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
      }),
    );

    it.effect("detects script install with nested path in ~/.axm/bin/", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "/Users/testuser/.axm/bin/v1.0.0/bun",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Script");
      }),
    );

    it.effect("detects script install on Windows with USERPROFILE dotfile layout", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "C:\\Users\\testuser\\.axm\\bin\\axm.exe",
          homeDir: "C:\\Users\\testuser",
          platform: "win32",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Script");
      }),
    );

    it.effect("matches Windows script paths case-insensitively", () =>
      Effect.gen(function* () {
        const result = yield* detectFromInputs({
          ...baseInputs,
          execPath: "C:\\USERS\\TESTUSER\\.AXM\\BIN\\AXM.EXE",
          homeDir: "c:\\users\\testuser",
          platform: "win32",
        });
        expect(result._tag).toBe("Script");
      }),
    );

    it.effect("matches extended-length Windows executable paths", () =>
      Effect.gen(function* () {
        const result = yield* detectFromInputs({
          ...baseInputs,
          execPath: "\\\\?\\C:\\Users\\testuser\\.axm\\bin\\axm.exe",
          homeDir: "C:\\Users\\testuser",
          platform: "win32",
        });
        expect(result._tag).toBe("Script");
      }),
    );

    it.effect("uses the launched executable when the runtime path differs", () =>
      Effect.gen(function* () {
        const result = yield* detectFromInputs({
          ...baseInputs,
          execPath: "C:\\tools\\bun.exe",
          invocationPaths: ["C:\\Users\\testuser\\.axm\\bin\\axm.exe"],
          homeDir: "C:\\Users\\testuser",
          platform: "win32",
        });
        expect(result._tag).toBe("Script");
        if (result._tag === "Script") {
          expect(result.execPath).toBe("C:\\Users\\testuser\\.axm\\bin\\axm.exe");
        }
      }),
    );

    it.effect("prefers the launched script executable over inherited package-manager state", () =>
      Effect.gen(function* () {
        const result = yield* detectFromInputs({
          ...baseInputs,
          execPath: "C:\\tools\\bun.exe",
          invocationPaths: ["C:\\Users\\testuser\\.axm\\bin\\axm.exe"],
          homeDir: "C:\\Users\\testuser",
          platform: "win32",
          packageManager: "pnpm",
          packageManagerVersion: "10.14.0",
        });
        expect(result._tag).toBe("Script");
        if (result._tag === "Script") {
          expect(result.detectionSource).toBe("executable-path");
          expect(result.execPath).toBe("C:\\Users\\testuser\\.axm\\bin\\axm.exe");
        }
      }),
    );

    it.effect("matches canonical script paths when home uses an alias", () =>
      Effect.gen(function* () {
        const parent = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "install-method-alias-"));
        const realHome = nodePath.join(parent, "real-home");
        const aliasedHome = nodePath.join(parent, "aliased-home");
        const executable = nodePath.join(realHome, ".axm", "bin", "axm");
        nodeFs.mkdirSync(nodePath.dirname(executable), { recursive: true });
        nodeFs.writeFileSync(executable, "");
        nodeFs.symlinkSync(realHome, aliasedHome, "dir");

        try {
          const result = yield* detectFromInputs({
            ...baseInputs,
            execPath: executable,
            homeDir: aliasedHome,
            platform: "linux",
          });
          expect(result._tag).toBe("Script");
          if (result._tag === "Script") {
            expect(result.detectionSource).toBe("resolved-executable-path");
          }
        } finally {
          nodeFs.rmSync(parent, { recursive: true, force: true });
        }
      }),
    );

    it.effect("returns unknown for legacy Windows AppData layout", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          execPath: "C:\\Users\\testuser\\AppData\\Local\\axm\\axm.exe",
          homeDir: "C:\\Users\\testuser",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Unknown");
      }),
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
      }),
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
      }),
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
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Priority 3: package-manager layout
  // ---------------------------------------------------------------------------

  describe("Priority 3: package-manager layout", () => {
    it.effect("does not guess npm from an ambiguous node_modules layout", () =>
      Effect.gen(function* () {
        const inputs: InstallMethodInputs = {
          ...baseInputs,
          importMetaUrl: "file:///usr/local/lib/node_modules/axm.sh/dist/main.js",
        };
        const result = yield* detectFromInputs(inputs);
        expect(result._tag).toBe("Unknown");
        if (result._tag === "Unknown") {
          expect(result.reason).toBe("ambiguous");
        }
      }),
    );

    it.effect("detects npm, pnpm, and Yarn Classic from explicit manager evidence", () =>
      Effect.gen(function* () {
        const npm = yield* detectFromInputs({ ...baseInputs, packageManager: "npm" });
        const pnpm = yield* detectFromInputs({ ...baseInputs, packageManager: "pnpm" });
        const yarn = yield* detectFromInputs({
          ...baseInputs,
          packageManager: "yarn",
          packageManagerVersion: "1.22.22",
        });
        const modernYarn = yield* detectFromInputs({
          ...baseInputs,
          packageManager: "yarn",
          packageManagerVersion: "4.9.2",
        });

        expect(npm._tag).toBe("Npm");
        expect(pnpm._tag).toBe("Pnpm");
        expect(yarn._tag).toBe("Yarn");
        if (yarn._tag === "Yarn") expect(yarn.supported).toBe(true);
        expect(modernYarn._tag).toBe("Yarn");
        if (modernYarn._tag === "Yarn") expect(modernYarn.supported).toBe(false);
      }),
    );

    it.effect("detects unambiguous pnpm and Yarn layouts", () =>
      Effect.gen(function* () {
        const pnpm = yield* detectFromInputs({
          ...baseInputs,
          importMetaUrl: "file:///opt/pnpm/global/5/node_modules/.pnpm/axm.sh/dist/main.js",
        });
        const yarn = yield* detectFromInputs({
          ...baseInputs,
          importMetaUrl: "file:///Users/test/.config/yarn/global/node_modules/axm.sh/main.js",
          packageManagerVersion: "1.22.22",
        });
        expect(pnpm._tag).toBe("Pnpm");
        expect(yarn._tag).toBe("Yarn");
      }),
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
      }),
    );

    it.effect("reads PowerShell 5.1 UTF-8 BOM install metadata", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(metaPath, `\uFEFF${JSON.stringify({ method: "script" })}`);

        const result = yield* detectFromInputs({
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        });
        expect(result._tag).toBe("Script");
      }),
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
      }),
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
      }),
    );

    it.effect("uses the executable path recorded by script metadata", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        const installedExecutable = nodePath.join(tempDir, ".axm", "bin", "axm");
        nodeFs.writeFileSync(
          metaPath,
          JSON.stringify({
            schemaVersion: 2,
            method: "script",
            installedAt: "2026-01-15T08:30:00.000Z",
            executablePath: installedExecutable,
          }),
        );

        const result = yield* detectFromInputs({
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/bun",
          importMetaUrl: "file:///some/other/path/main.ts",
        });
        expect(result._tag).toBe("Script");
        if (result._tag === "Script") {
          expect(result.execPath).toBe(installedExecutable);
          expect(result.managerOwnedExecutable).toBe(installedExecutable);
        }
      }),
    );

    it.effect("reads pnpm and Yarn metadata", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(
          metaPath,
          JSON.stringify({
            schemaVersion: 2,
            method: "pnpm",
            installedAt: "2026-01-15T08:30:00.000Z",
          }),
        );
        const pnpm = yield* detectFromInputs({
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/axm",
        });
        expect(pnpm._tag).toBe("Pnpm");

        nodeFs.writeFileSync(
          metaPath,
          JSON.stringify({
            schemaVersion: 2,
            method: "yarn",
            installedAt: "2026-01-15T08:30:00.000Z",
            managerMajorVersion: 4,
          }),
        );
        const yarn = yield* detectFromInputs({
          ...baseInputs,
          homeDir: tempDir,
          execPath: "/some/other/bin/axm",
        });
        expect(yarn._tag).toBe("Yarn");
        if (yarn._tag === "Yarn") expect(yarn.supported).toBe(false);
      }),
    );

    it.effect("treats executable path and metadata disagreement as conflicting", () =>
      Effect.gen(function* () {
        const executable = nodePath.join(tempDir, ".axm", "bin", "axm");
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(
          metaPath,
          JSON.stringify({
            schemaVersion: 2,
            method: "npm",
            installedAt: "2026-01-15T08:30:00.000Z",
          }),
        );
        const result = yield* detectFromInputs({
          ...baseInputs,
          homeDir: tempDir,
          execPath: executable,
        });
        expect(result._tag).toBe("Unknown");
        if (result._tag === "Unknown") {
          expect(result.reason).toBe("conflicting");
          expect(result.detectionSource).toBe("conflicting");
        }
      }),
    );

    it.effect("treats package-manager and metadata disagreement as conflicting", () =>
      Effect.gen(function* () {
        const metaPath = nodePath.join(tempDir, ".axm", "install-meta.json");
        nodeFs.writeFileSync(
          metaPath,
          JSON.stringify({
            schemaVersion: 2,
            method: "npm",
            installedAt: "2026-01-15T08:30:00.000Z",
          }),
        );
        const result = yield* detectFromInputs({
          ...baseInputs,
          homeDir: tempDir,
          importMetaUrl: "file:///opt/pnpm/global/5/node_modules/.pnpm/axm.sh/main.js",
        });
        expect(result._tag).toBe("Unknown");
        if (result._tag === "Unknown") {
          expect(result.reason).toBe("conflicting");
          expect(result.detectionSource).toBe("conflicting");
        }
      }),
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
        if (result._tag === "Unknown") {
          expect(result.evidence).toContain("install-metadata:invalid");
        }
      }),
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
        if (result._tag === "Unknown") {
          expect(result.evidence).toContain("install-metadata:invalid");
        }
      }),
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
        if (result._tag === "Unknown") {
          expect(result.evidence).toContain("install-metadata:missing");
        }
      }),
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

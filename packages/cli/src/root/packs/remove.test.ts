/**
 * Unit tests for the packs remove handler.
 *
 * Tests removing extensions from pack manifests including glob expansion,
 * extension not in pack, and pack not found cases.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import type { CliEnvironmentService } from "@axm.sh/core/unstable/cli-flags";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handlePacksRemove, type PacksRemoveHandlerArgs } from "./remove.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    profile?: string;
    packs?: Record<string, unknown>;
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    profile: opts.profile,
    packs: opts.packs,
  });
};

const createPackManifest = (
  tempDir: string,
  profile: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const packDir = path.join(tempDir, ".axm", "extensions", profile, "packs", name);
  fs.mkdirSync(packDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    profile,
    type: "pack",
    name,
    version: manifest["version"] ?? "0.0.1",
    skills: manifest["skills"] ?? {},
    commands: manifest["commands"] ?? {},
    "mcp-servers": manifest["mcp-servers"] ?? {},
  };
  fs.writeFileSync(
    path.join(packDir, "axm-pack.json"),
    JSON.stringify(normalizedManifest, null, 2),
  );
  return packDir;
};

const defaultArgs = (
  pack: string,
  extension: string,
  overrides: Partial<PacksRemoveHandlerArgs> = {},
): PacksRemoveHandlerArgs => ({
  pack,
  extension,
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs-remove.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-remove-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (flagsOverrides?: Partial<CliEnvironmentService>) =>
    makeWorkspaceHandlerTestContext({ flags: flagsOverrides });

  describe("remove specific extension", () => {
    it.effect("removes a specific extension from the pack manifest", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        packs: { "frontend-tools": "@acme/packs/frontend-tools" },
      });
      createPackManifest(tempDir, "@acme", "frontend-tools", {
        name: "@acme/packs/frontend-tools",
        version: "0.0.1",
        skills: { "@acme/skills/code-review": "^1.2.0", "@acme/skills/linting": "^2.0.0" },
        commands: {},
        "mcp-servers": {},
      });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksRemove(defaultArgs("frontend-tools", "@acme/skills/code-review"));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "packs",
            "frontend-tools",
            "axm-pack.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.skills["@acme/skills/code-review"]).toBeUndefined();
          expect(manifest.skills["@acme/skills/linting"]).toBe("^2.0.0");
          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        packs: { "frontend-tools": "@acme/packs/frontend-tools" },
      });
      createPackManifest(tempDir, "@acme", "frontend-tools", {
        name: "@acme/packs/frontend-tools",
        version: "0.0.1",
        skills: { "@acme/skills/code-review": "^1.2.0", "@acme/skills/linting": "^2.0.0" },
        commands: {},
        "mcp-servers": {},
      });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksRemove(
            defaultArgs("frontend-tools", "@acme/skills/code-review", { preview: true }),
          );

          // Manifest should still have the extension (not removed)
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "packs",
            "frontend-tools",
            "axm-pack.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.skills["@acme/skills/code-review"]).toBe("^1.2.0");
          expect(manifest.skills["@acme/skills/linting"]).toBe("^2.0.0");

          // Preview log message should appear
          expect(logs.info.some((m) => m.includes("Previewing"))).toBe(true);
        }),
      );
    });
  });

  describe("glob pattern expansion", () => {
    it.effect("removes extensions matching glob from pack manifest", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        packs: { "my-pack": "@acme/packs/my-pack" },
      });
      createPackManifest(tempDir, "@acme", "my-pack", {
        name: "@acme/packs/my-pack",
        version: "0.0.1",
        skills: {
          "@acme/skills/effect-basics": "^1.0.0",
          "@acme/skills/effect-streams": "^2.0.0",
          "@acme/skills/other-skill": "^3.0.0",
        },
        commands: {},
        "mcp-servers": {},
      });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksRemove(defaultArgs("my-pack", "@acme/skills/effect-*"));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "packs",
            "my-pack",
            "axm-pack.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.skills["@acme/skills/effect-basics"]).toBeUndefined();
          expect(manifest.skills["@acme/skills/effect-streams"]).toBeUndefined();
          expect(manifest.skills["@acme/skills/other-skill"]).toBe("^3.0.0");
        }),
      );
    });

    it.effect("fails when glob matches no extensions in pack", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        packs: { "my-pack": "@acme/packs/my-pack" },
      });
      createPackManifest(tempDir, "@acme", "my-pack", {
        name: "@acme/packs/my-pack",
        version: "0.0.1",
        skills: { "@acme/skills/some-skill": "^1.0.0" },
        commands: {},
        "mcp-servers": {},
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksRemove(defaultArgs("my-pack", "nonexistent-*")).pipe(
            Effect.flip,
          );
          expect(getAppError(error).what).toContain("No extensions in pack match");
        }),
      );
    });
  });

  describe("conflict-safe manifest apply", () => {
    it.effect("sequential removes each see updated manifest", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        packs: { "frontend-tools": "@acme/packs/frontend-tools" },
      });
      createPackManifest(tempDir, "@acme", "frontend-tools", {
        name: "@acme/packs/frontend-tools",
        version: "0.0.1",
        skills: {
          "@acme/skills/code-review": "^1.2.0",
          "@acme/skills/linting": "^2.0.0",
          "@acme/skills/testing": "^3.0.0",
        },
        commands: {},
        "mcp-servers": {},
      });

      return provide(
        Effect.gen(function* () {
          // First removal
          yield* handlePacksRemove(defaultArgs("frontend-tools", "@acme/skills/code-review"));

          // Second removal (hash is re-read from updated manifest)
          yield* handlePacksRemove(defaultArgs("frontend-tools", "@acme/skills/linting"));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "packs",
            "frontend-tools",
            "axm-pack.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.skills["@acme/skills/code-review"]).toBeUndefined();
          expect(manifest.skills["@acme/skills/linting"]).toBeUndefined();
          expect(manifest.skills["@acme/skills/testing"]).toBe("^3.0.0");
        }),
      );
    });
  });

  describe("extension not in pack", () => {
    it.effect("fails when extension is not in the pack manifest", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        packs: { "my-pack": "@acme/packs/my-pack" },
      });
      createPackManifest(tempDir, "@acme", "my-pack", {
        name: "@acme/packs/my-pack",
        version: "0.0.1",
        skills: {},
        commands: {},
        "mcp-servers": {},
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksRemove(
            defaultArgs("my-pack", "@acme/skills/nonexistent"),
          ).pipe(Effect.flip);
          expect(getAppError(error).what).toContain("not in the pack");
        }),
      );
    });
  });

  describe("pack not found", () => {
    it.effect("fails when pack does not exist in settings", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksRemove(
            defaultArgs("nonexistent-pack", "@acme/skills/some-ext"),
          ).pipe(Effect.flip);
          expect(getAppError(error).what).toContain("not found");
        }),
      );
    });
  });
});

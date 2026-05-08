/**
 * Unit tests for the subagents new handler.
 *
 * Tests profile resolution, name validation, manifest creation, <name>.md,
 * settings registration, rendering, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import type { ExtensionName } from "@agentxm/client-core/unstable/extensions";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { extensionName, writeWorkspaceFiles } from "../../../test-stubs.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { handleSubagentsNew, type SubagentsNewHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    profile?: string;
    subagents?: Record<string, unknown>;
    lockfileSubagents?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents,
    owner: opts.profile,
    subagents: opts.subagents,
    lockfileSubagents: opts.lockfileSubagents,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<SubagentsNewHandlerArgs> = {},
): SubagentsNewHandlerArgs => ({
  name: extensionName(name),
  profile: Option.none(),
  agents: Option.none(),
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (flagsOverrides?: {
    verbose?: boolean;
    debug?: boolean;
    nonInteractive?: boolean;
  }) => {
    const ctx = makeWorkspaceHandlerTestContext({ flags: flagsOverrides });
    // Add CodingAgentRepositoryLive to the layer stack
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive);
    return {
      ...ctx,
      fullLayer,
      provide: <A, E>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
        effect: Effect.Effect<A, E, any>,
      ) => effect.pipe(Effect.provide(fullLayer)),
    };
  };

  describe("success", () => {
    it.effect("creates subagent with manifest, <name>.md, and settings", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("my-subagent"));

          // Verify manifest
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "subagents",
            "my-subagent",
            "subagent.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@acme");
          expect(manifest.type).toBe("subagent");
          expect(manifest.name).toBe("my-subagent");
          expect(manifest.version).toBe("0.0.1");
          expect(manifest).not.toHaveProperty("agents");

          // Verify my-subagent.md
          const subagentMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "subagents",
            "my-subagent",
            "src",
            "my-subagent.md",
          );
          expect(fs.existsSync(subagentMdPath)).toBe(true);
          const subagentMd = fs.readFileSync(subagentMdPath, "utf-8");
          expect(subagentMd).toContain("name: my-subagent");

          // Verify settings registration
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.subagents).toBeDefined();
          expect(settings.subagents["my-subagent"]).toEqual({
            source: "@acme/subagents/my-subagent",
            authored: true,
          });

          // Verify lockfile registration
          const lockfilePath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockfilePath, "utf-8"));
          expect(lockfile.subagents["my-subagent"]).toMatchObject({
            type: "registry",
            owner: "@acme",
            name: "my-subagent",
            resolvedVersion: "0.0.1",
            sourceName: "local",
            agents: ["claude-code"],
          });

          expect(logs.success.some((m) => m.includes("@acme/subagents/my-subagent"))).toBe(true);
          expect(rendererState.breadcrumbs).toEqual([
            {
              task: "edit",
              description:
                "Edit `.axm/extensions/@acme/subagents/my-subagent/src/my-subagent.md` to fill in instructions",
            },
            {
              task: "sync",
              description: "Apply changes to your workspace",
              command: ["axm", "sync"],
            },
          ]);
        }),
      );
    });
  });

  describe("profile override", () => {
    it.effect("uses --profile override instead of workspace profile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("my-subagent", { profile: Option.some("@corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "subagents",
            "my-subagent",
            "subagent.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
          expect(manifest.type).toBe("subagent");
          expect(manifest.name).toBe("my-subagent");
        }),
      );
    });

    it.effect("normalizes profile without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("my-subagent", { profile: Option.some("corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "subagents",
            "my-subagent",
            "subagent.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
        }),
      );
    });
  });

  describe("no profile configured", () => {
    it.effect("fails when no profile is configured and no --profile override", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSubagentsNew(defaultArgs("my-subagent")).pipe(Effect.flip);
          expect(getAppError(error).message).toContain("No owner configured");
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects name starting with hyphen", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSubagentsNew({
            ...defaultArgs("valid-name"),
            name: "-bad-name" as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });

    it.effect("rejects uppercase name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSubagentsNew({
            ...defaultArgs("valid-name"),
            name: "MySubagent" as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });

    it.effect("rejects name exceeding 64 characters", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });
      const longName = "a".repeat(65);

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSubagentsNew({
            ...defaultArgs("valid-name"),
            name: longName as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });
  });

  describe("subagent already exists", () => {
    it.effect("fails when subagent already exists in lockfile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        lockfileSubagents: {
          "my-subagent": {
            type: "local",
            path: "/installed",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSubagentsNew(defaultArgs("my-subagent")).pipe(Effect.flip);
          expect(getAppError(error).message).toContain("already exists");
        }),
      );
    });
  });

  describe("<name>.md content", () => {
    it.effect("writes <name>.md with required name frontmatter and placeholder body", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("my-tool"));

          const subagentMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "subagents",
            "my-tool",
            "src",
            "my-tool.md",
          );
          const content = fs.readFileSync(subagentMdPath, "utf-8");

          // Frontmatter has just `name`; body is the placeholder.
          expect(content).toMatch(/^---\n/);
          expect(content).toContain("name: my-tool");
          expect(content).toContain("Describe what this subagent does");
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("my-subagent", { preview: true }));

          // Manifest should NOT be created
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "subagents",
            "my-subagent",
            "subagent.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Settings should NOT have the subagent registered
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.subagents?.["my-subagent"]).toBeUndefined();

          // Preview log message should appear
          expect(logs.info.some((m) => m.includes("Previewing"))).toBe(true);
        }),
      );
    });
  });
});

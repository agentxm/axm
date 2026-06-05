/**
 * Unit tests for the subagents new handler.
 *
 * Tests owner resolution, name validation, manifest creation, <name>.md,
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
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { extensionName, writeWorkspaceFiles } from "../../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
} from "../../../test-helpers.js";
import { handleSubagentsNew, type SubagentsNewHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    owner?: string;
    subagents?: Record<string, unknown>;
    lockfileSubagents?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents,
    owner: opts.owner,
    subagents: opts.subagents,
    lockfileSubagents: opts.lockfileSubagents,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<SubagentsNewHandlerArgs> = {},
): SubagentsNewHandlerArgs => ({
  name: extensionName(name),
  owner: Option.none(),
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

  const makeLayers = (opts?: { readonly machine?: boolean }) => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: opts?.machine });
    const workspaceServiceLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive);
    const fullLayer = Layer.provideMerge(SubagentManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  describe("success", () => {
    it.effect("creates subagent with manifest, <name>.md, and settings", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: ["claude-code"] });

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
            sourceName: "default",
            agents: ["claude-code"],
          });

          expect(logs.success.some((m) => m.includes("@acme/subagents/my-subagent"))).toBe(true);
          expect(rendererState.suggestions).toEqual([
            {
              description:
                "Edit `.axm/extensions/@acme/subagents/my-subagent/src/my-subagent.md` to fill in instructions",
            },
          ]);
        }),
      );
    });

    it.effect("emits scaffold plan JSON with artifact in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("machine-subagent"));

          expect(logs.success).toEqual(["Created subagent @acme/subagents/machine-subagent"]);
          expect(rendererState.summaries).toEqual([
            "-> .axm/extensions/@acme/subagents/machine-subagent   0.0.1 | 2 files",
          ]);
          const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
          const result = expectAppliedPlanResult(renderedResult.data, {
            planName: "New subagent",
          });
          const steps = planResultSteps(result);
          const firstStep = expectRecord(expectDefined(steps[0], "Expected first step"));
          expect(firstStep).toMatchObject({
            label: "@acme/subagents/machine-subagent",
            status: "applied",
            message: "Created subagent @acme/subagents/machine-subagent",
            artifact: {
              path: ".axm/extensions/@acme/subagents/machine-subagent",
              scope: "project",
              version: "0.0.1",
              change: "created",
              fileCount: 2,
              targets: [
                {
                  path: ".axm/extensions/@acme/subagents/machine-subagent/subagent.json",
                  change: "created",
                },
                {
                  path: ".axm/extensions/@acme/subagents/machine-subagent/src/machine-subagent.md",
                  change: "created",
                },
              ],
            },
          });
          expect(rendererState.suggestions).toEqual([
            {
              description:
                "Edit `.axm/extensions/@acme/subagents/machine-subagent/src/machine-subagent.md` to fill in instructions",
            },
          ]);
        }),
      );
    });
  });

  describe("owner override", () => {
    it.effect("uses --owner override instead of workspace owner", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("my-subagent", { owner: Option.some("@corp") }));

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

    it.effect("normalizes owner without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSubagentsNew(defaultArgs("my-subagent", { owner: Option.some("corp") }));

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

  describe("no owner configured", () => {
    it.effect("fails when no owner is configured and no --owner override", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSubagentsNew(defaultArgs("my-subagent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("No owner configured");
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects name starting with hyphen", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

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
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

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
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });
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
    it.effect("fails when subagent already exists in settings", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        owner: "@acme",
        subagents: {
          "my-subagent": {
            source: "@acme/subagents/my-subagent",
            authored: true,
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSubagentsNew(defaultArgs("my-subagent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("already exists");
        }),
      );
    });
  });

  describe("<name>.md content", () => {
    it.effect("writes <name>.md with required name frontmatter and placeholder body", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

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
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: ["claude-code"] });

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

          // Preview outcome should appear
          expect(logs.info.some((m) => m.includes("Would create 1 subagent"))).toBe(true);
        }),
      );
    });
  });
});

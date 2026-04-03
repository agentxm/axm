/**
 * Unit tests for the packs unpack command handler.
 *
 * Tests the unpack flow: read locked pack -> build plan with install ops
 * for each extension -> uninstall-pack -> execute plan.
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
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import {
  getErrorResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";
import { handleUnpack, type UnpackHandlerArgs } from "./handler.js";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + optional packs. */
const initWorkspace = (
  axmDir: string,
  options: {
    skills?: Record<string, unknown>;
    commands?: Record<string, unknown>;
    "mcp-servers"?: Record<string, unknown>;
    packs?: Record<string, unknown>;
    lockSkills?: Record<string, unknown>;
    lockCommands?: Record<string, unknown>;
    lockMcpServers?: Record<string, unknown>;
    lockPacks?: Record<string, unknown>;
  } = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      profile: "@test",
      agents: ["claude-code"],
      sources: [{ name: "local", type: "registry", location: "file:///tmp/test-registry" }],
      ...(options.skills ? { skills: options.skills } : {}),
      ...(options.commands ? { commands: options.commands } : {}),
      ...(options["mcp-servers"] ? { "mcp-servers": options["mcp-servers"] } : {}),
      ...(options.packs ? { packs: options.packs } : {}),
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({
      lockfileVersion: 1,
      skills: options.lockSkills ?? {},
      ...(options.lockCommands ? { commands: options.lockCommands } : {}),
      ...(options.lockMcpServers ? { "mcp-servers": options.lockMcpServers } : {}),
      ...(options.lockPacks ? { packs: options.lockPacks } : {}),
    }),
  );
};

/** Create canonical extension directories on disk (as if pack install placed them). */
const createCanonicalDirs = (
  baseDir: string,
  opts: {
    skills?: ReadonlyArray<{ profile: string; name: string }>;
    commands?: ReadonlyArray<{ profile: string; name: string }>;
    mcpServers?: ReadonlyArray<{ profile: string; name: string }>;
  },
) => {
  for (const skill of opts.skills ?? []) {
    const srcDir = path.join(
      baseDir,
      ".axm",
      "extensions",
      skill.profile,
      "skills",
      skill.name,
      "src",
    );
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "SKILL.md"), `# ${skill.name}`);
  }
  for (const cmd of opts.commands ?? []) {
    const cmdDir = path.join(baseDir, ".axm", "extensions", cmd.profile, "commands", cmd.name);
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, "run.sh"), "#!/bin/bash");
  }
  for (const srv of opts.mcpServers ?? []) {
    const srvDir = path.join(baseDir, ".axm", "extensions", srv.profile, "mcp-servers", srv.name);
    fs.mkdirSync(srvDir, { recursive: true });
    fs.writeFileSync(path.join(srvDir, "server.js"), "module.exports = {}");
  }
};

const defaultArgs = (
  name: string,
  overrides: Partial<UnpackHandlerArgs> = {},
): UnpackHandlerArgs => ({
  name,
  strictAgentSync: Option.none(),
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs unpack.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-unpack-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
      wsOptions: wsOverrides,
    });
    const SPLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(handlerTestContext.baseLayer, handlerTestContext.wsLayer),
    );
    const FullLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      handlerTestContext.wsLayer,
      SPLayer,
      CodingAgentRepositoryLive,
    );
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  describe("full unpack", () => {
    it.effect("promotes resolved skills to direct entries and removes pack", () => {
      const { provide, logs } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir, {
        packs: { "frontend-tools": "@test/packs/frontend-tools" },
        lockSkills: {
          "code-review": {
            type: "registry",
            profile: "@test",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "test-writer": {
            type: "registry",
            profile: "@test",
            name: "test-writer",
            resolvedVersion: "2.0.0",
            integrity: "",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        lockPacks: {
          "frontend-tools": {
            type: "registry",
            profile: "@test",
            name: "frontend-tools",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "local",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@test/skills/code-review": "1.0.0",
              "@test/skills/test-writer": "2.0.0",
            },
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      // Create canonical dirs so install handlers skip fetch
      createCanonicalDirs(tempDir, {
        skills: [
          { profile: "@test", name: "code-review" },
          { profile: "@test", name: "test-writer" },
        ],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUnpack(defaultArgs("frontend-tools"));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Check settings: pack should be removed, skills should be added
          const settingsContent = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          );
          // Pack should be removed (empty object or undefined)
          const packs = settingsContent.packs ?? {};
          expect(Object.keys(packs)).not.toContain("frontend-tools");
          expect(settingsContent.skills).toBeDefined();
          // Skills are stored by short name (after profile/)
          expect(settingsContent.skills["code-review"]).toBeDefined();
          expect(settingsContent.skills["test-writer"]).toBeDefined();

          // Check lockfile: pack should be removed
          const lockContent = YAML.parse(
            fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"),
          );
          const lockPacks = lockContent.packs ?? {};
          expect(Object.keys(lockPacks)).not.toContain("frontend-tools");
        }),
      );
    });
  });

  describe("existing direct entries preserved", () => {
    it.effect("does not overwrite existing direct skill entries", () => {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir, {
        skills: {
          "code-review": { source: "@test/skills/code-review", enabled: false },
        },
        packs: { "frontend-tools": "@test/packs/frontend-tools" },
        lockSkills: {
          "code-review": {
            type: "registry",
            profile: "@test",
            name: "code-review",
            resolvedVersion: "0.9.0",
            integrity: "",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "new-skill": {
            type: "registry",
            profile: "@test",
            name: "new-skill",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        lockPacks: {
          "frontend-tools": {
            type: "registry",
            profile: "@test",
            name: "frontend-tools",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "local",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@test/skills/code-review": "1.0.0",
              "@test/skills/new-skill": "1.0.0",
            },
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      // Create canonical dirs so install handlers skip fetch
      createCanonicalDirs(tempDir, {
        skills: [
          { profile: "@test", name: "code-review" },
          { profile: "@test", name: "new-skill" },
        ],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUnpack(defaultArgs("frontend-tools"));

          const settingsContent = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          );

          // Existing entry should be preserved (code-review was already directly installed)
          // The install handler still runs but the existing settings entry stays
          expect(settingsContent.skills["code-review"]).toBeDefined();

          // New skill from pack should be added
          expect(settingsContent.skills["new-skill"]).toBeDefined();
        }),
      );
    });
  });

  describe("pack not installed", () => {
    it.effect("fails when pack is not in lockfile", () => {
      const { provide, rendererState } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleUnpack(defaultArgs("nonexistent-pack")).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                what: e.what,
                howToFix: Option.getOrElse(e.howToFix, () => ""),
              }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.what).toContain("not installed");
          expect(errorResult.howToFix).toContain("axm packs install");
          expect(rendererState.spinnerMessages).toContain("Checking pack...");
          expect(rendererState.spinnerMessages).toContain("Failed");
        }),
      );
    });
  });
});

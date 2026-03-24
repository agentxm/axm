/**
 * Unit tests for the packs unpack command handler.
 *
 * Tests the unpack flow: read locked pack -> build plan with install ops
 * for each extension -> uninstall-pack -> execute plan.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  makeClackPromptTestLayer,
  makeClackLogTestLayer,
  makeClackSpinnerTestLayer,
} from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { CliEnvConfig } from "../../../config/index.js";
import { TelemetryClientTest } from "../../../telemetry/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { handleUnpack, type UnpackHandlerArgs } from "./handler.js";

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
      namespace: "@test",
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
    skills?: ReadonlyArray<{ namespace: string; name: string }>;
    commands?: ReadonlyArray<{ namespace: string; name: string }>;
    mcpServers?: ReadonlyArray<{ namespace: string; name: string }>;
  },
) => {
  for (const skill of opts.skills ?? []) {
    const srcDir = path.join(
      baseDir,
      ".axm",
      "extensions",
      skill.namespace,
      "skills",
      skill.name,
      "src",
    );
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "SKILL.md"), `# ${skill.name}`);
  }
  for (const cmd of opts.commands ?? []) {
    const cmdDir = path.join(baseDir, ".axm", "extensions", cmd.namespace, "commands", cmd.name);
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, "run.sh"), "#!/bin/bash");
  }
  for (const srv of opts.mcpServers ?? []) {
    const srvDir = path.join(baseDir, ".axm", "extensions", srv.namespace, "mcp-servers", srv.name);
    fs.mkdirSync(srvDir, { recursive: true });
    fs.writeFileSync(path.join(srvDir, "server.js"), "module.exports = {}");
  }
};

const defaultArgs = (
  name: string,
  overrides: Partial<UnpackHandlerArgs> = {},
): UnpackHandlerArgs => ({
  name,
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
    const [logLayer, mockLog] = makeClackLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeClackSpinnerTestLayer();
    const [confirmLayer] = makeClackPromptTestLayer({ type: "return", value: true });
    const [selectLayer] = makeClackPromptTestLayer({ type: "select", index: 0 });
    const [multiselectLayer] = makeClackPromptTestLayer({ type: "multiselect", indices: [] });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
      CliFlagsTest(),
      TelemetryClientTest,
      CliEnvConfig.testDefaults,
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  describe("full unpack", () => {
    it.effect("promotes resolved skills to direct entries and removes pack", () => {
      const { provide, mockLog } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir, {
        packs: { "frontend-tools": "@test/packs/frontend-tools" },
        lockSkills: {
          "code-review": {
            type: "registry",
            namespace: "@test",
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
            namespace: "@test",
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
            namespace: "@test",
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
          { namespace: "@test", name: "code-review" },
          { namespace: "@test", name: "test-writer" },
        ],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUnpack(defaultArgs("frontend-tools"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Check settings: pack should be removed, skills should be added
          const settingsContent = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          );
          // Pack should be removed (empty object or undefined)
          const packs = settingsContent.packs ?? {};
          expect(Object.keys(packs)).not.toContain("frontend-tools");
          expect(settingsContent.skills).toBeDefined();
          // Skills are stored by short name (after namespace/)
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
            namespace: "@test",
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
            namespace: "@test",
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
            namespace: "@test",
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
          { namespace: "@test", name: "code-review" },
          { namespace: "@test", name: "new-skill" },
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
      const { provide, mockSpinner } = makeLayers();
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
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("not installed");
          expect((result as { howToFix: string }).howToFix).toContain("axm packs install");
          expect(mockSpinner.starts).toContain("Checking pack...");
          expect(mockSpinner.stops).toContain("Failed");
        }),
      );
    });
  });
});

/**
 * Unit tests for the packs unpack command handler.
 *
 * Tests the unpack flow: read locked pack -> promote extensions -> remove pack.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  makeSpinnerTestLayer,
} from "../../../tui/index.js";
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
    packs?: Record<string, unknown>;
    lockSkills?: Record<string, unknown>;
    lockPacks?: Record<string, unknown>;
  } = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      scope: "@test",
      agents: ["claude-code"],
      sources: [{ name: "local", type: "registry", location: "file:///tmp/test-registry" }],
      ...(options.skills ? { skills: options.skills } : {}),
      ...(options.packs ? { packs: options.packs } : {}),
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({
      lockfileVersion: 1,
      skills: options.lockSkills ?? {},
      ...(options.lockPacks ? { packs: options.lockPacks } : {}),
    }),
  );
};

const defaultArgs = (
  name: string,
  overrides: Partial<UnpackHandlerArgs> = {},
): UnpackHandlerArgs => ({
  name,
  yes: true,
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
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer({ type: "return", value: true });
    const [selectLayer] = makeSelectTestLayer({ type: "return", index: 0 });
    const [multiselectLayer] = makeMultiselectTestLayer({ type: "return", indices: [] });
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      global: false,
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
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
        packs: { "frontend-tools": "@test/frontend-tools" },
        lockPacks: {
          "frontend-tools": {
            type: "registry",
            scope: "@test",
            name: "frontend-tools",
            resolvedVersion: "1.0.0",
            checksum: "sha256:abc123",
            sourceName: "local",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@test/code-review": "1.0.0",
              "@test/test-writer": "2.0.0",
            },
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
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
          // Skills are stored by short name (after scope/)
          expect(settingsContent.skills["code-review"]).toBe("@test/code-review");
          expect(settingsContent.skills["test-writer"]).toBe("@test/test-writer");

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
          "code-review": { source: "@test/code-review", enabled: false },
        },
        packs: { "frontend-tools": "@test/frontend-tools" },
        lockSkills: {
          "code-review": {
            type: "registry",
            scope: "@test",
            name: "code-review",
            resolvedVersion: "0.9.0",
            checksum: "sha256:existing",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        lockPacks: {
          "frontend-tools": {
            type: "registry",
            scope: "@test",
            name: "frontend-tools",
            resolvedVersion: "1.0.0",
            checksum: "sha256:abc123",
            sourceName: "local",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@test/code-review": "1.0.0",
              "@test/new-skill": "1.0.0",
            },
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUnpack(defaultArgs("frontend-tools"));

          const settingsContent = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          );

          // Existing entry should be preserved (not overwritten) - uses short name
          expect(settingsContent.skills["code-review"]).toEqual({
            source: "@test/code-review",
            enabled: false,
          });

          // New skill from pack should be added using short name
          expect(settingsContent.skills["new-skill"]).toBe("@test/new-skill");
        }),
      );
    });
  });

  describe("pack not installed", () => {
    it.effect("fails when pack is not in lockfile", () => {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleUnpack(defaultArgs("nonexistent-pack")).pipe(
            Effect.catchTag("CliError", (e) =>
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
        }),
      );
    });
  });
});

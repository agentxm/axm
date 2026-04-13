import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestRenderer } from "../../cli-renderer/index.js";
import { decodeHandleSync } from "../../extensions/handle.js";
import { LockfileSchema } from "../../lockfile/schema.js";
import {
  makeRegistryCommandLockEntry,
  makeRegistryExtensionPackLockEntry,
  makeRegistrySkillLockEntry,
  makeLocalSkillLockEntry,
  writeWorkspaceFiles,
} from "../test-stubs.js";
import { layer as workspaceLayer } from "../service.js";
import { detectLockfileBlockers } from "./detect-lockfile-blockers.js";

describe("detectLockfileBlockers", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-blockers-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createWorkspace = (options: Parameters<typeof writeWorkspaceFiles>[1]) => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      ...options,
    });
  };

  /**
   * Write workspace files with MCP server entries, using the correct
   * `mcpServers` key (camelCase) that matches the Schema field name.
   */
  const createWorkspaceWithMcpServers = (opts: {
    readonly settingsMcpServers?: Record<string, unknown>;
    readonly lockfileMcpServers?: Record<string, unknown>;
  }) => {
    const axmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    const settings: Record<string, unknown> = {
      agents: ["claude-code"],
      ...(opts.settingsMcpServers !== undefined && { mcpServers: opts.settingsMcpServers }),
    };
    fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));

    const lockfile = {
      lockfileVersion: 1,
      skills: {},
      ...(opts.lockfileMcpServers !== undefined && { mcpServers: opts.lockfileMcpServers }),
    };
    const encoded = Schema.encodeSync(LockfileSchema)(
      Schema.decodeUnknownSync(LockfileSchema)(lockfile),
    );
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(encoded));
  };

  const makeLayers = () => {
    const { layer: rendererLayer } = TestRenderer.make();
    const baseLayer = Layer.mergeAll(NodeServices.layer, TestFlagsLayer(), rendererLayer);
    const wsLayer = Layer.provide(
      workspaceLayer({
        scope: "project",
        builtInSources: [
          {
            name: "default",
            type: "registry",
            location: new URL("https://registry.agentxm.ai"),
          },
        ],
      }),
      baseLayer,
    );
    return Layer.mergeAll(baseLayer, wsLayer);
  };

  // -----------------------------------------------------------------------
  // Healthy state -- no blockers
  // -----------------------------------------------------------------------

  it.effect("returns no blockers when settings and lockfile are in sync", () =>
    (() => {
      createWorkspace({
        commands: { "my-command": "@acme/commands/my-command" },
        lockfileCommands: {
          "my-command": makeRegistryCommandLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "my-command",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();
        expect(blockers).toEqual([]);
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("returns no blockers when workspace has no extensions", () =>
    (() => {
      createWorkspace({});

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();
        expect(blockers).toEqual([]);
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  // -----------------------------------------------------------------------
  // Missing entries (settings has it, lockfile doesn't)
  // -----------------------------------------------------------------------

  it.effect("emits lockfile-entry-missing for a command in settings but not in lockfile", () =>
    (() => {
      createWorkspace({
        commands: { "my-command": "@acme/commands/my-command" },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-missing",
              subject: { kind: "extension", ref: "command:my-command" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-missing for a skill in settings but not in lockfile", () =>
    (() => {
      createWorkspace({
        skills: { "my-skill": "@acme/skills/my-skill" },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-missing",
              subject: { kind: "extension", ref: "skill:my-skill" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-missing for a subagent in settings but not in lockfile", () =>
    (() => {
      createWorkspace({
        subagents: { "my-subagent": "@acme/subagents/my-subagent" },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-missing",
              subject: { kind: "extension", ref: "subagent:my-subagent" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-missing for a pack in settings but not in lockfile", () =>
    (() => {
      createWorkspace({
        packs: { "my-pack": "@acme/packs/my-pack" },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-missing",
              subject: { kind: "extension", ref: "pack:my-pack" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-missing for an MCP server in settings but not in lockfile", () =>
    (() => {
      createWorkspaceWithMcpServers({
        settingsMcpServers: { "my-server": "@acme/mcp-servers/my-server" },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-missing",
              subject: { kind: "extension", ref: "mcp-server:my-server" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  // -----------------------------------------------------------------------
  // Stale entries (both exist but owner/name mismatch)
  // -----------------------------------------------------------------------

  it.effect("emits lockfile-entry-stale for a command with changed owner", () =>
    (() => {
      createWorkspace({
        commands: { "my-command": "@newowner/commands/my-command" },
        lockfileCommands: {
          "my-command": makeRegistryCommandLockEntry({
            owner: decodeHandleSync("@oldowner"),
            name: "my-command",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-stale",
              subject: { kind: "extension", ref: "command:my-command" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-stale for a skill with changed owner", () =>
    (() => {
      createWorkspace({
        skills: { "my-skill": "@newowner/skills/my-skill" },
        lockfileSkills: {
          "my-skill": makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@oldowner"),
            name: "my-skill",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-stale",
              subject: { kind: "extension", ref: "skill:my-skill" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-stale for a local skill with changed path", () =>
    (() => {
      createWorkspace({
        skills: { "my-skill": "/new/path/to/skill" },
        lockfileSkills: {
          "my-skill": makeLocalSkillLockEntry({ path: "/old/path/to/skill" }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-stale",
              subject: { kind: "extension", ref: "skill:my-skill" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-stale for a subagent with changed name in source", () =>
    (() => {
      createWorkspace({
        subagents: { "my-subagent": "@acme/subagents/different-name" },
        lockfileSubagents: {
          "my-subagent": {
            type: "registry",
            owner: "@acme",
            name: "my-subagent",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-stale",
              subject: { kind: "extension", ref: "subagent:my-subagent" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-stale for a pack with changed owner", () =>
    (() => {
      createWorkspace({
        packs: { "my-pack": "@newowner/packs/my-pack" },
        lockfilePacks: {
          "my-pack": makeRegistryExtensionPackLockEntry({
            owner: decodeHandleSync("@oldowner"),
            name: "my-pack",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-stale",
              subject: { kind: "extension", ref: "pack:my-pack" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-stale for an MCP server with changed owner", () =>
    (() => {
      createWorkspaceWithMcpServers({
        settingsMcpServers: { "my-server": "@newowner/mcp-servers/my-server" },
        lockfileMcpServers: {
          "my-server": {
            type: "registry",
            owner: "@oldowner",
            name: "my-server",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-stale",
              subject: { kind: "extension", ref: "mcp-server:my-server" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  // -----------------------------------------------------------------------
  // Orphaned entries (lockfile has it, settings doesn't)
  // -----------------------------------------------------------------------

  it.effect("emits lockfile-entry-orphaned for a command in lockfile but not in settings", () =>
    (() => {
      createWorkspace({
        lockfileCommands: {
          "orphaned-command": makeRegistryCommandLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "orphaned-command",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-orphaned",
              subject: { kind: "extension", ref: "command:orphaned-command" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-orphaned for a skill in lockfile but not in settings", () =>
    (() => {
      createWorkspace({
        lockfileSkills: {
          "orphaned-skill": makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "orphaned-skill",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-orphaned",
              subject: { kind: "extension", ref: "skill:orphaned-skill" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-orphaned for a subagent in lockfile but not in settings", () =>
    (() => {
      createWorkspace({
        lockfileSubagents: {
          "orphaned-subagent": {
            type: "registry",
            owner: "@acme",
            name: "orphaned-subagent",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-orphaned",
              subject: { kind: "extension", ref: "subagent:orphaned-subagent" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-orphaned for a pack in lockfile but not in settings", () =>
    (() => {
      createWorkspace({
        lockfilePacks: {
          "orphaned-pack": makeRegistryExtensionPackLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "orphaned-pack",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-orphaned",
              subject: { kind: "extension", ref: "pack:orphaned-pack" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("emits lockfile-entry-orphaned for an MCP server in lockfile but not in settings", () =>
    (() => {
      createWorkspaceWithMcpServers({
        lockfileMcpServers: {
          "orphaned-server": {
            type: "registry",
            owner: "@acme",
            name: "orphaned-server",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-orphaned",
              subject: { kind: "extension", ref: "mcp-server:orphaned-server" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  // -----------------------------------------------------------------------
  // No source resolution calls
  // -----------------------------------------------------------------------

  it.effect("does not require SourceHostProviders (no source resolution calls are made)", () =>
    (() => {
      // This test verifies that detectLockfileBlockers does NOT require
      // SourceHostProviders in its dependency graph. The layers do not
      // provide SourceHostProviders; if the function tried to use it,
      // the effect would fail with a missing service error.
      createWorkspace({
        commands: { "my-command": "@acme/commands/my-command" },
        lockfileCommands: {
          "my-command": makeRegistryCommandLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "my-command",
          }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();
        expect(blockers).toEqual([]);
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  // -----------------------------------------------------------------------
  // Multiple extension types in a single workspace
  // -----------------------------------------------------------------------

  it.effect("detects blockers across multiple extension types simultaneously", () =>
    (() => {
      createWorkspace({
        commands: { "missing-cmd": "@acme/commands/missing-cmd" },
        skills: { "orphaned-only": "@acme/skills/orphaned-only" },
        lockfileSkills: {
          // "orphaned-only" skill is present in both, so not orphaned
          "orphaned-only": makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "orphaned-only",
          }),
          // "extra-skill" is only in lockfile -> orphaned
          "extra-skill": makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "extra-skill",
          }),
        },
        // "missing-cmd" command has no lockfile entry -> missing
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "lockfile-entry-missing",
              subject: { kind: "extension", ref: "command:missing-cmd" },
            }),
            expect.objectContaining({
              reason: "lockfile-entry-orphaned",
              subject: { kind: "extension", ref: "skill:extra-skill" },
            }),
          ]),
        );
        // "orphaned-only" should NOT appear (it's in both settings and lockfile)
        expect(blockers).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              subject: { kind: "extension", ref: "skill:orphaned-only" },
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  // -----------------------------------------------------------------------
  // Healthy local skill (matching path)
  // -----------------------------------------------------------------------

  it.effect("returns no blocker for a local skill with matching path", () =>
    (() => {
      createWorkspace({
        skills: { "local-skill": "/path/to/my-skill" },
        lockfileSkills: {
          "local-skill": makeLocalSkillLockEntry({ path: "/path/to/my-skill" }),
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectLockfileBlockers();
        expect(blockers).toEqual([]);
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );
});

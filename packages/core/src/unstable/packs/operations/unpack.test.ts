/**
 * Unit tests for unpackExtensionPack operation handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { vi } from "vitest";
import { Workspace, type WorkspaceContextService } from "../../workspace/service-interface.js";
import { taxonomyStubs } from "../../workspace/test-stubs.js";
import { unpackExtensionPack, type UnpackExtensionPackOperation } from "./unpack.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): UnpackExtensionPackOperation => ({
  name: "unpack-pack",
  args: { name },
});

const makeWorkspaceMock = (
  overrides: Partial<WorkspaceContextService> = {},
): WorkspaceContextService => ({
  ...taxonomyStubs,
  scope: "project",
  path: "/mock/.axm",
  baseDir: "/mock",
  getConfiguredSources: () => Effect.succeed([]),
  getConfiguredSourceByName: () => Effect.succeed(Option.none()),
  getRegistrySourceHosts: () => Effect.succeed([]),
  getConfiguredProfile: () => Effect.succeed("@test"),
  getDefaultProfile: () => Effect.succeed(Option.none()),
  addConfiguredSource: () => Effect.void,
  getConfiguredSkills: () => Effect.succeed({}),
  getInstalledSkills: () => Effect.succeed({}),
  getConfiguredAgents: () => Effect.succeed(["claude-code"]),
  getLockedSkills: () => Effect.succeed({}),
  getLockedSkill: () => Effect.succeed(Option.none()),
  getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
  setSkill: () => Effect.void,
  setSkillLock: () => Effect.void,
  removeSkill: () => Effect.void,
  removeSkillFromSettings: () => Effect.void,
  updateSkillEntry: () => Effect.void,
  setSkillEntry: () => Effect.void,
  renameSkill: () => Effect.void,
  updateLockEntryAgents: () => Effect.void,
  addConfiguredAgent: () => Effect.void,
  getConfiguredPacks: () => Effect.succeed({}),
  getInstalledPacks: () => Effect.succeed({}),
  getLockedExtensionPacks: () => Effect.succeed({}),
  getLockedExtensionPack: () => Effect.succeed(Option.none()),
  setExtensionPack: () => Effect.void,
  removeExtensionPack: () => Effect.void,
  getExtensionPackDir: () => Effect.succeed({ canonicalPath: "" }),
  getLockedCommands: () => Effect.succeed({}),
  getLockedCommand: () => Effect.succeed(Option.none()),
  setCommand: () => Effect.void,
  setCommandLock: () => Effect.void,
  removeCommand: () => Effect.void,
  getLockedMcpServers: () => Effect.succeed({}),
  getLockedMcpServer: () => Effect.succeed(Option.none()),
  setMcpServer: () => Effect.void,
  setMcpServerLock: () => Effect.void,
  removeMcpServer: () => Effect.void,
  removeSkillLock: () => Effect.void,
  removeCommandSettings: () => Effect.void,
  removeCommandLock: () => Effect.void,
  removeMcpServerSettings: () => Effect.void,
  removeMcpServerLock: () => Effect.void,
  removeExtensionPackSettings: () => Effect.void,
  removeExtensionPackLock: () => Effect.void,
  isExtensionRequiredByInstalledExtensionPack: () => Effect.succeed(false),
  markDependencyRetainedInLockfile: () => Effect.void,
  getConfiguredCommands: () => Effect.succeed({}),
  getConfiguredMcpServers: () => Effect.succeed({}),
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("unpackExtensionPack", () => {
  it.effect("promotes resolved commands and mcp-servers (not just skills)", () => {
    const setCommand = vi.fn(() => Effect.void);
    const setMcpServer = vi.fn(() => Effect.void);
    const setSkill = vi.fn(() => Effect.void);

    const mock = makeWorkspaceMock({
      getLockedExtensionPack: () =>
        Effect.succeed(
          Option.some({
            type: "registry" as const,
            owner: "@acme",
            name: "full-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            installedAt: new Date(),
            updatedAt: new Date(),
            resolvedSkills: { "@acme/skills/my-skill": "1.0.0" },
            resolvedCommands: { "@acme/commands/my-cmd": "2.0.0" },
            resolvedMcpServers: { "@acme/mcp-servers/my-server": "3.0.0" },
            resolvedSubagents: {},
          }),
        ),
      setSkill,
      setCommand,
      setMcpServer,
    });

    return Effect.gen(function* () {
      const result = yield* unpackExtensionPack(makeOp("full-pack"));

      expect(result.result).toBe("success");
      expect(result.message).toContain("3 extension(s)");
      expect(setSkill).toHaveBeenCalledTimes(1);
      expect(setCommand).toHaveBeenCalledTimes(1);
      expect(setMcpServer).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(Workspace.layer(mock)));
  });

  it.effect("skips existing direct command entries", () => {
    const setCommand = vi.fn(() => Effect.void);

    const mock = makeWorkspaceMock({
      getLockedExtensionPack: () =>
        Effect.succeed(
          Option.some({
            type: "registry" as const,
            owner: "@acme",
            name: "pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            installedAt: new Date(),
            updatedAt: new Date(),
            resolvedSkills: {},
            resolvedCommands: { "@acme/commands/existing-cmd": "1.0.0" },
            resolvedMcpServers: {},
            resolvedSubagents: {},
          }),
        ),
      getConfiguredCommands: () =>
        Effect.succeed({
          "existing-cmd": {
            source: "@acme/commands/existing-cmd",
            enabled: true,
            packagingKind: "native" as const,
          },
        }),
      setCommand,
    });

    return Effect.gen(function* () {
      const result = yield* unpackExtensionPack(makeOp("pack"));

      expect(result.result).toBe("success");
      // Should not call setCommand because existing-cmd is already configured
      expect(setCommand).not.toHaveBeenCalled();
    }).pipe(Effect.provide(Workspace.layer(mock)));
  });

  it.effect("fails when pack is not installed", () => {
    const mock = makeWorkspaceMock();

    return Effect.gen(function* () {
      const result = yield* unpackExtensionPack(makeOp("nonexistent")).pipe(
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("not installed");
    }).pipe(Effect.provide(Workspace.layer(mock)));
  });
});

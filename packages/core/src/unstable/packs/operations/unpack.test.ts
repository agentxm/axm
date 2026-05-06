/**
 * Unit tests for unpackExtensionPack operation handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { vi } from "vitest";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import {
  makeBaseWorkspaceMock,
  makeRegistryExtensionPackLockEntry,
} from "../../workspace/test-stubs.js";
import { exactVersion, handle } from "../../test-helpers.js";
import { unpackExtensionPack, type UnpackExtensionPackOperation } from "./unpack.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): UnpackExtensionPackOperation => ({
  name: "unpack-pack",
  args: { name },
});

const makeWorkspaceMock = (
  overrides: Partial<WorkspaceMutationsService> &
    Partial<WorkspaceMutationsService["records"]> = {},
): WorkspaceMutationsService =>
  makeBaseWorkspaceMock("/mock/.axm", {
    getConfiguredSources: () => Effect.succeed([]),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.some(handle("@test"))),
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
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
          Option.some(
            makeRegistryExtensionPackLockEntry({
              owner: handle("@acme"),
              name: "full-pack",
              resolvedVersion: exactVersion("1.0.0"),
              integrity: "",
              sourceName: "default",
              installedAt: new Date(),
              updatedAt: new Date(),
              resolvedSkills: { "@acme/skills/my-skill": exactVersion("1.0.0") },
              resolvedCommands: { "@acme/commands/my-cmd": exactVersion("2.0.0") },
              resolvedMcpServers: { "@acme/mcp-servers/my-server": exactVersion("3.0.0") },
              resolvedSubagents: {},
            }),
          ),
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
    }).pipe(Effect.provide(WorkspaceMutations.layer(mock)));
  });

  it.effect("skips existing direct command entries", () => {
    const setCommand = vi.fn(() => Effect.void);

    const mock = makeWorkspaceMock({
      getLockedExtensionPack: () =>
        Effect.succeed(
          Option.some(
            makeRegistryExtensionPackLockEntry({
              owner: handle("@acme"),
              name: "pack",
              resolvedVersion: exactVersion("1.0.0"),
              integrity: "",
              sourceName: "default",
              installedAt: new Date(),
              updatedAt: new Date(),
              resolvedSkills: {},
              resolvedCommands: { "@acme/commands/existing-cmd": exactVersion("1.0.0") },
              resolvedMcpServers: {},
              resolvedSubagents: {},
            }),
          ),
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
    }).pipe(Effect.provide(WorkspaceMutations.layer(mock)));
  });

  it.effect("fails when pack is not installed", () => {
    const mock = makeWorkspaceMock();

    return Effect.gen(function* () {
      const result = yield* unpackExtensionPack(makeOp("nonexistent")).pipe(
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("not installed");
    }).pipe(Effect.provide(WorkspaceMutations.layer(mock)));
  });
});

/**
 * Unit tests for unpackPack operation handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { vi } from "vitest";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import {
  configuredRow,
  makeBaseWorkspaceMock,
  makeRegistryPackLockEntry,
  rowsFor,
} from "../../workspace/test-stubs.js";
import { exactVersion, handle } from "../../test-helpers.js";
import { unpackPack, type UnpackPackOperation } from "./unpack.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): UnpackPackOperation => ({
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
    ...overrides,
  });

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("unpackPack", () => {
  it.effect("promotes resolved commands and mcps (not just skills)", () => {
    const setCommand = vi.fn(() => Effect.void);
    const setMcpServer = vi.fn(() => Effect.void);
    const setSkill = vi.fn(() => Effect.void);

    const mock = makeWorkspaceMock({
      getLockedPack: () =>
        Effect.succeed(
          Option.some(
            makeRegistryPackLockEntry({
              owner: handle("@acme"),
              name: "full-pack",
              resolvedVersion: exactVersion("1.0.0"),
              integrity: "",
              sourceName: "default",

              publisherBindingId: "hbnd_test",
              installedAt: DateTime.makeUnsafe("2024-01-15T12:00:00.000Z"),
              updatedAt: DateTime.makeUnsafe("2024-01-15T12:00:00.000Z"),
              resolvedSkills: {
                "@acme/skills/my-skill": {
                  version: exactVersion("1.0.0"),
                  publisherBindingId: "hbnd_test",
                },
              },
              resolvedCommands: {
                "@acme/commands/my-cmd": {
                  version: exactVersion("2.0.0"),
                  publisherBindingId: "hbnd_test",
                },
              },
              resolvedMcpServers: {
                "@acme/mcps/my-server": {
                  version: exactVersion("3.0.0"),
                  publisherBindingId: "hbnd_test",
                },
              },
              resolvedSubagents: {},
            }),
          ),
        ),
      setSkill,
      setCommand,
      setMcpServer,
    });

    return Effect.gen(function* () {
      const result = yield* unpackPack(makeOp("full-pack"));

      expect(result.result).toBe("success");
      expect(result.message).toContain("3 extensions");
      expect(setSkill).toHaveBeenCalledTimes(1);
      expect(setCommand).toHaveBeenCalledTimes(1);
      expect(setMcpServer).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(WorkspaceMutations.layer(mock)));
  });

  it.effect("skips existing direct command entries", () => {
    const setCommand = vi.fn(() => Effect.void);

    const mock = makeWorkspaceMock({
      getLockedPack: () =>
        Effect.succeed(
          Option.some(
            makeRegistryPackLockEntry({
              owner: handle("@acme"),
              name: "pack",
              resolvedVersion: exactVersion("1.0.0"),
              integrity: "",
              sourceName: "default",

              publisherBindingId: "hbnd_test",
              installedAt: DateTime.makeUnsafe("2024-01-15T12:00:00.000Z"),
              updatedAt: DateTime.makeUnsafe("2024-01-15T12:00:00.000Z"),
              resolvedSkills: {},
              resolvedCommands: {
                "@acme/commands/existing-cmd": {
                  version: exactVersion("1.0.0"),
                  publisherBindingId: "hbnd_test",
                },
              },
              resolvedMcpServers: {},
              resolvedSubagents: {},
            }),
          ),
        ),
      rows: rowsFor({
        command: [
          configuredRow({
            type: "command",
            name: "existing-cmd",
            source: "@acme/commands/existing-cmd",
            packagingKind: "native",
          }),
        ],
      }),
      setCommand,
    });

    return Effect.gen(function* () {
      const result = yield* unpackPack(makeOp("pack"));

      expect(result.result).toBe("success");
      // Should not call setCommand because existing-cmd is already configured
      expect(setCommand).not.toHaveBeenCalled();
    }).pipe(Effect.provide(WorkspaceMutations.layer(mock)));
  });

  it.effect("fails when pack is not installed", () => {
    const mock = makeWorkspaceMock();

    return Effect.gen(function* () {
      const result = yield* unpackPack(makeOp("nonexistent")).pipe(
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("not installed");
    }).pipe(Effect.provide(WorkspaceMutations.layer(mock)));
  });
});

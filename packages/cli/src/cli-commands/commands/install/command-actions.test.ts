/**
 * Unit tests for command install workflow actions.
 *
 * Tests parseArgs behavior for registry pattern and bare name inputs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Workspace } from "../../../workspace/service.js";
import { CommandManager } from "../../../extensions/commands/manager.js";
import { SourceHostProviders } from "../../../sources/index.js";
import {
  InstallCommandCommandWorkflowActions,
  InstallCommandCommandWorkflowActionsLive,
} from "./command-actions.js";

const mockWorkspace = {
  getConfiguredNamespace: () => Effect.succeed("@test-ns"),
  getRegistrySourceHosts: () => Effect.succeed([]),
  getLockedCommand: () => Effect.succeed(Option.none()),
  getLockedSkills: () => Effect.succeed({}),
  getLockedCommands: () => Effect.succeed({}),
  getLockedMcpServers: () => Effect.succeed({}),
  getLockedPacks: () => Effect.succeed({}),
  getInstalledSkills: () => Effect.succeed({}),
  getConfiguredSkills: () => Effect.succeed({}),
  getConfiguredCommands: () => Effect.succeed({}),
  getConfiguredMcpServers: () => Effect.succeed({}),
  isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
  markDependencyRetainedInLockfile: () => Effect.void,
  resolvePlan: () => Effect.void,
  nonInteractive: false,
} as unknown as Workspace["Type"];

const mockCommandManager = {
  install: vi.fn(),
  uninstall: vi.fn(),
  isInstalled: vi.fn(),
} as unknown as CommandManager["Type"];

const mockSourceHostProviders = {
  find: vi.fn(() => Effect.succeed([])),
  fetch: vi.fn(),
  cloneUrl: vi.fn(),
  origin: vi.fn(() => "test"),
} as unknown as SourceHostProviders["Type"];

const testLayer = Layer.mergeAll(
  Layer.succeed(Workspace, mockWorkspace),
  Layer.succeed(CommandManager, mockCommandManager),
  Layer.succeed(SourceHostProviders, mockSourceHostProviders),
);

const actionsLayer = Layer.provide(InstallCommandCommandWorkflowActionsLive, testLayer);

const runWithActions = <A, E>(
  fn: (actions: InstallCommandCommandWorkflowActions["Type"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const actions = yield* InstallCommandCommandWorkflowActions;
    return yield* fn(actions);
  }).pipe(Effect.provide(actionsLayer), Effect.runPromise);

describe("parseCommandInstallArgs", () => {
  it("parses @namespace/commands/name registry pattern", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/commands/my-cmd",
        global: false,
        yes: false,
        force: false,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.namespace).toBe("@acme");
    expect(result.commandName).toBe("my-cmd");
    expect(Option.isNone(result.versionConstraint)).toBe(true);
    expect(result.resolvedInput).toBe("@acme/commands/my-cmd");
  });

  it("parses @namespace/commands/name@version with constraint", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/commands/my-cmd@^1.0.0",
        global: false,
        yes: false,
        force: false,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.namespace).toBe("@acme");
    expect(result.commandName).toBe("my-cmd");
    expect(Option.getOrNull(result.versionConstraint)).toBe("^1.0.0");
  });

  it("resolves bare name using configured namespace", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "my-cmd",
        global: false,
        yes: false,
        force: false,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.namespace).toBe("@test-ns");
    expect(result.commandName).toBe("my-cmd");
    expect(result.resolvedInput).toBe("@test-ns/commands/my-cmd");
  });

  it("rejects non-commands registry type", async () => {
    await expect(
      runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/skills/my-skill",
          global: false,
          yes: false,
          force: false,
          nonInteractive: Option.none(),
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects URL sources", async () => {
    await expect(
      runWithActions((actions) =>
        actions.parseArgs({
          source: "https://example.com/repo",
          global: false,
          yes: false,
          force: false,
          nonInteractive: Option.none(),
        }),
      ),
    ).rejects.toThrow();
  });

  it("passes force flag through", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "my-cmd",
        global: false,
        yes: false,
        force: true,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.force).toBe(true);
  });
});

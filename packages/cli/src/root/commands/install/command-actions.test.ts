/**
 * Unit tests for command install workflow actions.
 *
 * Tests parseArgs behavior for registry pattern and bare name inputs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { makeBaseWorkspaceMock } from "../../../test-stubs.js";
import { CommandManager } from "@axm.sh/core/unstable/commands";
import { SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import {
  InstallCommandCommandWorkflowActions,
  InstallCommandCommandWorkflowActionsLive,
} from "./command-actions.js";

const mockWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
  getConfiguredProfile: () => Effect.succeed("@test-ns"),
});

const mockCommandManager = {
  extensionType: "command",
  isInstalled: vi.fn(() => Effect.succeed(true)),
  materializeInstall: vi.fn(),
  materializeUninstall: vi.fn(),
  upsertSettingsEntry: vi.fn(),
  removeSettingsEntry: vi.fn(),
  upsertLockfileEntry: vi.fn(),
  removeLockfileEntry: vi.fn(),
} satisfies ServiceMap.Service.Shape<typeof CommandManager>;

const mockSourceHostProviders = {
  find: vi.fn(() => Effect.succeed([])),
  fetch: vi.fn(),
  cloneUrl: vi.fn(),
  origin: vi.fn(() => "test"),
} satisfies ServiceMap.Service.Shape<typeof SourceHostProviders>;

const [promptLayer] = makeTestPrompt({
  confirmResponses: [true],
  textResponses: [""],
});

const testLayer = Layer.mergeAll(
  Layer.succeed(Workspace, mockWorkspace),
  Layer.succeed(CommandManager, mockCommandManager),
  Layer.succeed(SourceHostProviders, mockSourceHostProviders),
  promptLayer,
  NodeServices.layer,
  CliEnvironmentTest(),
);

const actionsLayer = Layer.provide(InstallCommandCommandWorkflowActionsLive, testLayer);

const runWithActions = <A, E>(
  fn: (
    actions: ServiceMap.Service.Shape<typeof InstallCommandCommandWorkflowActions>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const actions = yield* InstallCommandCommandWorkflowActions;
    return yield* fn(actions);
  }).pipe(Effect.provide(actionsLayer), Effect.runPromise);

describe("parseCommandInstallArgs", () => {
  it("parses @profile/commands/name registry pattern", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/commands/my-cmd",
      }),
    );
    expect(result.profile).toBe("@acme");
    expect(result.commandName).toBe("my-cmd");
    expect(Option.isNone(result.versionConstraint)).toBe(true);
    expect(result.resolvedInput).toBe("@acme/commands/my-cmd");
  });

  it("parses @profile/commands/name@version with constraint", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/commands/my-cmd@^1.0.0",
      }),
    );
    expect(result.profile).toBe("@acme");
    expect(result.commandName).toBe("my-cmd");
    expect(Option.getOrNull(result.versionConstraint)).toBe("^1.0.0");
  });

  it("resolves bare name using configured profile", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "my-cmd",
      }),
    );
    expect(result.profile).toBe("@test-ns");
    expect(result.commandName).toBe("my-cmd");
    expect(result.resolvedInput).toBe("@test-ns/commands/my-cmd");
  });

  it("rejects non-commands registry type", async () => {
    await expect(
      runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/skills/my-skill",
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects URL sources", async () => {
    await expect(
      runWithActions((actions) =>
        actions.parseArgs({
          source: "https://example.com/repo",
        }),
      ),
    ).rejects.toThrow();
  });

  it("sets force to false (force is now passed through plan flags, not parsed args)", async () => {
    const forceActionsLayer = Layer.provide(
      InstallCommandCommandWorkflowActionsLive,
      Layer.mergeAll(
        Layer.succeed(Workspace, mockWorkspace),
        Layer.succeed(CommandManager, mockCommandManager),
        Layer.succeed(SourceHostProviders, mockSourceHostProviders),
        promptLayer,
        NodeServices.layer,
        CliEnvironmentTest(),
      ),
    );
    const result = await Effect.gen(function* () {
      const actions = yield* InstallCommandCommandWorkflowActions;
      return yield* actions.parseArgs({
        source: "my-cmd",
      });
    }).pipe(Effect.provide(forceActionsLayer), Effect.runPromise);
    expect(result.force).toBe(false);
  });
});

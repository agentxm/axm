/**
 * Unit tests for command install workflow actions.
 *
 * Tests parseArgs behavior for registry pattern and bare name inputs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { exactVersion, extensionName, handle, makeBaseWorkspaceMock } from "../../../test-stubs.js";
import { CommandManager, type RegistryCommandRef } from "@agentxm/client-core/unstable/commands";
import type { CommandLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  InstallCommandCommandWorkflowActions,
  InstallCommandCommandWorkflowActionsLive,
} from "./command-actions.js";

const mockWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
  getConfiguredOwner: () => Effect.succeed(Option.some(normalizeHandle("@test-ns"))),
  getRegistrySourceHosts: () =>
    Effect.succeed([
      {
        name: "default",
        type: "registry",
        location: new URL("file:///tmp/registry"),
      },
    ]),
});

const mockCommandManager = {
  type: "command",
  isInstalled: vi.fn(() => Effect.succeed(true)),
  materializeInstall: vi.fn(),
  listMaterializable: vi.fn(() => Effect.succeed([])),
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

const makeActionsLayer = (
  workspace = mockWorkspace,
  commandManager: ServiceMap.Service.Shape<typeof CommandManager> = mockCommandManager,
) =>
  Layer.provide(
    InstallCommandCommandWorkflowActionsLive,
    Layer.mergeAll(
      Layer.succeed(WorkspaceMutations, workspace),
      Layer.succeed(CommandManager, commandManager),
      Layer.succeed(SourceHostProviders, mockSourceHostProviders),
      NodeServices.layer,
      TestFlagsLayer(),
    ),
  );

const defaultFlags = { yes: false, force: false, preview: false } as const;

const runWithActions = <A, E>(
  fn: (
    actions: ServiceMap.Service.Shape<typeof InstallCommandCommandWorkflowActions>,
  ) => Effect.Effect<A, E>,
  layer = makeActionsLayer(),
) =>
  Effect.gen(function* () {
    const actions = yield* InstallCommandCommandWorkflowActions;
    return yield* fn(actions);
  }).pipe(Effect.provide(layer));

const makeRegistryRef = (name = "my-cmd"): RegistryCommandRef => ({
  type: "command",
  refType: "registry",
  source: {
    type: "registry",
    location: new URL("file:///tmp/registry"),
    owner: Option.none(),
  },
  command: { name: extensionName(name) },
  owner: handle("@acme"),
  name: extensionName(name),
  version: exactVersion("1.0.0"),
  integrity: Option.none(),
  packages: [],
});

const makeCommandLockEntry = (): CommandLockEntry => ({
  type: "local",
  path: "fixtures/my-cmd",
  installedAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
});

const expectReadyStep = (
  plan: Plan,
): Extract<Plan["jobs"][number]["steps"][number], { readiness: "ready" }> => {
  const step = plan.jobs[0]?.steps[0];
  if (step === undefined || step.readiness !== "ready") {
    throw new Error("Expected a ready plan step");
  }
  return step;
};

describe("parseCommandInstallArgs", () => {
  it.effect("parses @owner/commands/name registry pattern", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/commands/my-cmd",
          ...defaultFlags,
        }),
      );
      expect(Option.getOrNull(result.owner)).toBe("@acme");
      expect(result.commandNames).toEqual(["my-cmd"]);
      expect(Option.isNone(result.versionRange)).toBe(true);
      expect(result.source.type).toBe("registry");
    }),
  );

  it.effect("parses @owner/commands/name@version with constraint", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/commands/my-cmd@^1.0.0",
          ...defaultFlags,
        }),
      );
      expect(Option.getOrNull(result.owner)).toBe("@acme");
      expect(result.commandNames).toEqual(["my-cmd"]);
      expect(Option.getOrNull(result.versionRange)).toBe("^1.0.0");
    }),
  );

  it.effect("resolves bare name using configured owner", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "my-cmd",
          ...defaultFlags,
        }),
      );
      expect(Option.getOrNull(result.owner)).toBe("@test-ns");
      expect(result.commandNames).toEqual(["my-cmd"]);
      expect(result.source.type).toBe("registry");
    }),
  );

  it.effect("rejects non-commands registry type", () =>
    Effect.gen(function* () {
      const error = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/skills/my-skill",
          ...defaultFlags,
        }),
      ).pipe(Effect.flip);
      expect(error).toBeDefined();
    }),
  );

  it.effect("rejects URL sources", () =>
    Effect.gen(function* () {
      const error = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "https://example.com/repo",
          ...defaultFlags,
        }),
      ).pipe(Effect.flip);
      expect(error).toBeDefined();
    }),
  );

  it.effect("sets force to false (force is now passed through plan flags, not parsed args)", () =>
    Effect.gen(function* () {
      const forceActionsLayer = Layer.provide(
        InstallCommandCommandWorkflowActionsLive,
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, mockWorkspace),
          Layer.succeed(CommandManager, mockCommandManager),
          Layer.succeed(SourceHostProviders, mockSourceHostProviders),
          NodeServices.layer,
          TestFlagsLayer(),
        ),
      );
      const result = yield* Effect.gen(function* () {
        const actions = yield* InstallCommandCommandWorkflowActions;
        return yield* actions.parseArgs({
          source: "my-cmd",
          ...defaultFlags,
        });
      }).pipe(Effect.provide(forceActionsLayer));
      expect(result.force).toBe(false);
    }),
  );
});

describe("buildPlan", () => {
  it.effect("returns command install artifacts from the applied workflow step", () =>
    Effect.gen(function* () {
      const lockEntry = makeCommandLockEntry();
      const getLockedCommand = vi
        .fn()
        .mockReturnValueOnce(Effect.succeed(Option.none()))
        .mockReturnValueOnce(Effect.succeed(Option.some(lockEntry)));
      const workspace = makeBaseWorkspaceMock("/tmp/axm", {
        getLockedCommand,
      });
      const commandManager = {
        ...mockCommandManager,
        materializeInstall: vi.fn(() => Effect.void),
        getLastMaterialization: vi.fn(() =>
          Effect.succeed({
            agents: ["claude-code"],
            targets: [
              {
                path: ".claude/commands/my-cmd.md",
                agentIds: ["claude-code"],
              },
            ],
          }),
        ),
        upsertLockfileEntry: vi.fn(() => Effect.void),
        upsertSettingsEntry: vi.fn(() => Effect.void),
      } satisfies ServiceMap.Service.Shape<typeof CommandManager>;

      const plan = yield* runWithActions(
        (actions) =>
          actions.buildPlan({
            refs: [{ ref: makeRegistryRef(), versionRange: Option.none() }],
            force: false,
          }),
        makeActionsLayer(workspace, commandManager),
      );
      const step = expectReadyStep(plan);
      const result = yield* step.run;

      expect(result).toEqual({
        result: "success",
        message: "Installed my-cmd",
        artifact: {
          path: ".claude/commands/my-cmd.md",
          scope: "project",
          agents: ["claude-code"],
          change: "created",
          fileCount: 1,
          targets: [
            {
              path: ".claude/commands/my-cmd.md",
              change: "created",
              agentIds: ["claude-code"],
            },
          ],
        },
      });
    }),
  );

  it.effect("returns an unchanged artifact without rewriting an installed command", () =>
    Effect.gen(function* () {
      const lockEntry = makeCommandLockEntry();
      const workspace = makeBaseWorkspaceMock("/tmp/axm", {
        getLockedCommand: () => Effect.succeed(Option.some(lockEntry)),
      });
      const commandManager = {
        ...mockCommandManager,
        materializeInstall: vi.fn(() => Effect.void),
        upsertLockfileEntry: vi.fn(() => Effect.void),
        upsertSettingsEntry: vi.fn(() => Effect.void),
      } satisfies ServiceMap.Service.Shape<typeof CommandManager>;

      const plan = yield* runWithActions(
        (actions) =>
          actions.buildPlan({
            refs: [{ ref: makeRegistryRef(), versionRange: Option.none() }],
            force: false,
          }),
        makeActionsLayer(workspace, commandManager),
      );
      const step = expectReadyStep(plan);
      const result = yield* step.run;

      expect(result).toEqual({
        result: "success",
        message: "my-cmd already installed",
        artifact: {
          path: "my-cmd",
          scope: "project",
          change: "unchanged",
        },
      });
      expect(commandManager.materializeInstall).not.toHaveBeenCalled();
      expect(commandManager.upsertLockfileEntry).not.toHaveBeenCalled();
      expect(commandManager.upsertSettingsEntry).not.toHaveBeenCalled();
    }),
  );

  it.effect("includes a target agents section", () =>
    Effect.gen(function* () {
      const plan = yield* runWithActions((actions) =>
        actions.buildPlan({
          refs: [{ ref: makeRegistryRef(), versionRange: Option.none() }],
          force: false,
        }),
      );

      expect(plan.sections).toEqual(
        expect.arrayContaining([
          {
            title: "Target agents",
            items: ["claude-code"],
          },
        ]),
      );
    }),
  );

  it.effect("includes a no-agents preview note when nothing is configured", () =>
    Effect.gen(function* () {
      const workspace = makeBaseWorkspaceMock("/tmp/axm", {
        getConfiguredOwner: () => Effect.succeed(Option.some(normalizeHandle("@test-ns"))),
        getConfiguredAgents: () => Effect.succeed([]),
      });

      const plan = yield* runWithActions(
        (actions) =>
          actions.buildPlan({
            refs: [{ ref: makeRegistryRef(), versionRange: Option.none() }],
            force: false,
          }),
        makeActionsLayer(workspace),
      );

      expect(plan.sections).toEqual(
        expect.arrayContaining([
          {
            title: "Target agents",
            items: ["No agents configured. No files would be rendered."],
          },
        ]),
      );
    }),
  );
});

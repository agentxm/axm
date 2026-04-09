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
import * as ServiceMap from "effect/ServiceMap";
import { normalizeHandle } from "@axm.sh/core/unstable/extensions";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { exactVersion, extensionName, handle, makeBaseWorkspaceMock } from "../../../test-stubs.js";
import { CommandManager, type RegistryCommandRef } from "@axm.sh/core/unstable/commands";
import { SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import {
  InstallCommandCommandWorkflowActions,
  InstallCommandCommandWorkflowActionsLive,
} from "./command-actions.js";

const mockWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
  getConfiguredProfile: () => Effect.succeed(normalizeHandle("@test-ns")),
});

const mockCommandManager = {
  type: "command",
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

const makeActionsLayer = (workspace = mockWorkspace) =>
  Layer.provide(
    InstallCommandCommandWorkflowActionsLive,
    Layer.mergeAll(
      Layer.succeed(Workspace, workspace),
      Layer.succeed(CommandManager, mockCommandManager),
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
  compatiblePackages: [],
});

describe("parseCommandInstallArgs", () => {
  it.effect("parses @owner/commands/name registry pattern", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/commands/my-cmd",
          ...defaultFlags,
        }),
      );
      expect(result.owner).toBe("@acme");
      expect(result.commandName).toBe("my-cmd");
      expect(Option.isNone(result.versionConstraint)).toBe(true);
      expect(result.resolvedInput).toBe("@acme/commands/my-cmd");
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
      expect(result.owner).toBe("@acme");
      expect(result.commandName).toBe("my-cmd");
      expect(Option.getOrNull(result.versionConstraint)).toBe("^1.0.0");
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
      expect(result.owner).toBe("@test-ns");
      expect(result.commandName).toBe("my-cmd");
      expect(result.resolvedInput).toBe("@test-ns/commands/my-cmd");
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
          Layer.succeed(Workspace, mockWorkspace),
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
  it.effect("includes a target agents section", () =>
    Effect.gen(function* () {
      const plan = yield* runWithActions((actions) =>
        actions.buildPlan({
          ref: makeRegistryRef(),
          versionConstraint: Option.none(),
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
        getConfiguredProfile: () => Effect.succeed(normalizeHandle("@test-ns")),
        getConfiguredAgents: () => Effect.succeed([]),
      });

      const plan = yield* runWithActions(
        (actions) =>
          actions.buildPlan({
            ref: makeRegistryRef(),
            versionConstraint: Option.none(),
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

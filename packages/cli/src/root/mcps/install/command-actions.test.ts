/**
 * Unit tests for MCP server install workflow actions.
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
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { makeBaseWorkspaceMock } from "../../../test-stubs.js";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  InstallMcpServerCommandWorkflowActions,
  InstallMcpServerCommandWorkflowActionsLive,
} from "./command-actions.js";

const mockWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
  getConfiguredOwner: () => Effect.succeed(Option.some(normalizeHandle("@test-ns"))),
});

const mockMcpServerManager = {
  type: "mcp-server",
  isInstalled: vi.fn(() => Effect.succeed(true)),
  materializeInstall: vi.fn(),
  listMaterializable: vi.fn(() => Effect.succeed([])),
  materializeUninstall: vi.fn(),
  upsertSettingsEntry: vi.fn(),
  removeSettingsEntry: vi.fn(),
  upsertLockfileEntry: vi.fn(),
  removeLockfileEntry: vi.fn(),
} satisfies ServiceMap.Service.Shape<typeof McpServerManager>;

const mockSourceHostProviders = {
  find: vi.fn(() => Effect.succeed([])),
  fetch: vi.fn(),
  cloneUrl: vi.fn(),
  origin: vi.fn(() => "test"),
} satisfies ServiceMap.Service.Shape<typeof SourceHostProviders>;

const renderer = TestRenderer.make();

const testLayer = Layer.mergeAll(
  Layer.succeed(WorkspaceMutations, mockWorkspace),
  Layer.succeed(McpServerManager, mockMcpServerManager),
  Layer.succeed(SourceHostProviders, mockSourceHostProviders),
  renderer.layer,
  CodingAgentRepositoryLive,
  NodeServices.layer,
  TestFlagsLayer(),
);

const actionsLayer = Layer.provide(InstallMcpServerCommandWorkflowActionsLive, testLayer);

const runWithActions = <A, E>(
  fn: (
    actions: ServiceMap.Service.Shape<typeof InstallMcpServerCommandWorkflowActions>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    return yield* fn(actions);
  }).pipe(Effect.provide(actionsLayer));

describe("parseMcpServerInstallArgs", () => {
  it.effect("parses @owner/mcps/name registry pattern", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/mcps/my-server",
        }),
      );
      expect(result.owner).toBe("@acme");
      expect(result.serverName).toBe("my-server");
      expect(Option.isNone(result.versionRange)).toBe(true);
      expect(result.resolvedInput).toBe("@acme/mcps/my-server");
    }),
  );

  it.effect("parses @owner/mcps/name@version with constraint", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/mcps/my-server@^2.0.0",
        }),
      );
      expect(result.owner).toBe("@acme");
      expect(result.serverName).toBe("my-server");
      expect(Option.getOrNull(result.versionRange)).toBe("^2.0.0");
    }),
  );

  it.effect("resolves bare name using configured owner", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "my-server",
        }),
      );
      expect(result.owner).toBe("@test-ns");
      expect(result.serverName).toBe("my-server");
      expect(result.resolvedInput).toBe("@test-ns/mcps/my-server");
    }),
  );

  it.effect("rejects non-mcps registry type", () =>
    Effect.gen(function* () {
      const error = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/skills/my-skill",
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
        }),
      ).pipe(Effect.flip);
      expect(error).toBeDefined();
    }),
  );

  it.effect("sets force to false (force is now passed through plan flags, not parsed args)", () =>
    Effect.gen(function* () {
      const forceActionsLayer = Layer.provide(
        InstallMcpServerCommandWorkflowActionsLive,
        testLayer,
      );
      const result = yield* Effect.gen(function* () {
        const actions = yield* InstallMcpServerCommandWorkflowActions;
        return yield* actions.parseArgs({
          source: "my-server",
        });
      }).pipe(Effect.provide(forceActionsLayer));
      expect(result.force).toBe(false);
    }),
  );
});

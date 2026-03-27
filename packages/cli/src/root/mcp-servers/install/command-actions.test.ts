/**
 * Unit tests for MCP server install workflow actions.
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
import { Workspace } from "../../../workspace/service.js";
import { makeBaseWorkspaceMock } from "../../../workspace/test-stubs.js";
import { McpServerManager } from "@axm.sh/core/unstable/extension-managers";
import { SourceHostProviders } from "../../../sources/index.js";
import {
  InstallMcpServerCommandWorkflowActions,
  InstallMcpServerCommandWorkflowActionsLive,
} from "./command-actions.js";

const mockWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
  getConfiguredProfile: () => Effect.succeed("@test-ns"),
});

const mockMcpServerManager = {
  extensionType: "mcp-server",
  isInstalled: vi.fn(() => Effect.succeed(true)),
  materializeInstall: vi.fn(),
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

const [promptLayer] = makeTestPrompt({
  confirmResponses: [true],
  textResponses: [""],
});

const testLayer = Layer.mergeAll(
  Layer.succeed(Workspace, mockWorkspace),
  Layer.succeed(McpServerManager, mockMcpServerManager),
  Layer.succeed(SourceHostProviders, mockSourceHostProviders),
  promptLayer,
  NodeServices.layer,
  CliEnvironmentTest(),
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
  }).pipe(Effect.provide(actionsLayer), Effect.runPromise);

describe("parseMcpServerInstallArgs", () => {
  it("parses @profile/mcp-servers/name registry pattern", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/mcp-servers/my-server",
      }),
    );
    expect(result.profile).toBe("@acme");
    expect(result.serverName).toBe("my-server");
    expect(Option.isNone(result.versionConstraint)).toBe(true);
    expect(result.resolvedInput).toBe("@acme/mcp-servers/my-server");
  });

  it("parses @profile/mcp-servers/name@version with constraint", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/mcp-servers/my-server@^2.0.0",
      }),
    );
    expect(result.profile).toBe("@acme");
    expect(result.serverName).toBe("my-server");
    expect(Option.getOrNull(result.versionConstraint)).toBe("^2.0.0");
  });

  it("resolves bare name using configured profile", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "my-server",
      }),
    );
    expect(result.profile).toBe("@test-ns");
    expect(result.serverName).toBe("my-server");
    expect(result.resolvedInput).toBe("@test-ns/mcp-servers/my-server");
  });

  it("rejects non-mcp-servers registry type", async () => {
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
      InstallMcpServerCommandWorkflowActionsLive,
      Layer.mergeAll(
        Layer.succeed(Workspace, mockWorkspace),
        Layer.succeed(McpServerManager, mockMcpServerManager),
        Layer.succeed(SourceHostProviders, mockSourceHostProviders),
        promptLayer,
        NodeServices.layer,
        CliEnvironmentTest(),
      ),
    );
    const result = await Effect.gen(function* () {
      const actions = yield* InstallMcpServerCommandWorkflowActions;
      return yield* actions.parseArgs({
        source: "my-server",
      });
    }).pipe(Effect.provide(forceActionsLayer), Effect.runPromise);
    expect(result.force).toBe(false);
  });
});

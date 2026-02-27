/**
 * Unit tests for MCP server install workflow actions.
 *
 * Tests parseArgs behavior for registry pattern and bare name inputs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeClackPromptTestLayer } from "../../../clack-effect/prompt/ClackPromptTest.js";
import { Workspace } from "../../../workspace/service.js";
import { McpServerManager } from "../../../extensions/mcp-servers/manager.js";
import { SourceHostProviders } from "../../../sources/index.js";
import {
  InstallMcpServerCommandWorkflowActions,
  InstallMcpServerCommandWorkflowActionsLive,
} from "./command-actions.js";

const mockWorkspace = {
  getConfiguredNamespace: () => Effect.succeed("@test-ns"),
  getRegistrySourceHosts: () => Effect.succeed([]),
  getLockedMcpServer: () => Effect.succeed(Option.none()),
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

const mockMcpServerManager = {
  install: vi.fn(),
  uninstall: vi.fn(),
  isInstalled: vi.fn(),
} as unknown as McpServerManager["Type"];

const mockSourceHostProviders = {
  find: vi.fn(() => Effect.succeed([])),
  fetch: vi.fn(),
  cloneUrl: vi.fn(),
  origin: vi.fn(() => "test"),
} as unknown as SourceHostProviders["Type"];

const promptLayer = makeClackPromptTestLayer({
  methodBehaviors: {
    confirm: { type: "return", value: true },
    text: { type: "return", value: "" },
  },
});

const testLayer = Layer.mergeAll(
  Layer.succeed(Workspace, mockWorkspace),
  Layer.succeed(McpServerManager, mockMcpServerManager),
  Layer.succeed(SourceHostProviders, mockSourceHostProviders),
  promptLayer,
  NodeContext.layer,
);

const actionsLayer = Layer.provide(InstallMcpServerCommandWorkflowActionsLive, testLayer);

const runWithActions = <A, E>(
  fn: (actions: InstallMcpServerCommandWorkflowActions["Type"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    return yield* fn(actions);
  }).pipe(Effect.provide(actionsLayer), Effect.runPromise);

describe("parseMcpServerInstallArgs", () => {
  it("parses @namespace/mcp-servers/name registry pattern", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/mcp-servers/my-server",
        scope: "project",
        yes: false,
        force: false,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.namespace).toBe("@acme");
    expect(result.serverName).toBe("my-server");
    expect(Option.isNone(result.versionConstraint)).toBe(true);
    expect(result.resolvedInput).toBe("@acme/mcp-servers/my-server");
  });

  it("parses @namespace/mcp-servers/name@version with constraint", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "@acme/mcp-servers/my-server@^2.0.0",
        scope: "project",
        yes: false,
        force: false,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.namespace).toBe("@acme");
    expect(result.serverName).toBe("my-server");
    expect(Option.getOrNull(result.versionConstraint)).toBe("^2.0.0");
  });

  it("resolves bare name using configured namespace", async () => {
    const result = await runWithActions((actions) =>
      actions.parseArgs({
        source: "my-server",
        scope: "project",
        yes: false,
        force: false,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.namespace).toBe("@test-ns");
    expect(result.serverName).toBe("my-server");
    expect(result.resolvedInput).toBe("@test-ns/mcp-servers/my-server");
  });

  it("rejects non-mcp-servers registry type", async () => {
    await expect(
      runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/skills/my-skill",
          scope: "project",
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
          scope: "project",
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
        source: "my-server",
        scope: "project",
        yes: false,
        force: true,
        nonInteractive: Option.none(),
      }),
    );
    expect(result.force).toBe(true);
  });
});

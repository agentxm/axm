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
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { TestRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { WorkspaceCatalogLive } from "@agentxm/extension-management/unstable/cli-runtime";
import { makeBaseWorkspaceMock, managerLifecycleStubs } from "../../../test-stubs.js";
import { McpServerManager } from "@agentxm/extension-management/unstable/mcps";
import { SourceHostProviders } from "@agentxm/extension-sources";
import { InstallMcpServerCommandWorkflowActions, parseEnvFlag } from "./command-actions.js";

const mockWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
  getConfiguredOwner: () => Effect.succeed(Option.some(normalizeHandle("@test-ns"))),
});

const mockMcpServerManager = {
  ...managerLifecycleStubs,
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
  resolveNamedRegistry: vi.fn(() => Effect.die("unused")),
  fetch: vi.fn(),
  cloneUrl: vi.fn(),
  origin: vi.fn(() => "test"),
} satisfies ServiceMap.Service.Shape<typeof SourceHostProviders>;

const renderer = TestRenderer.make();

const workspaceLayer = Layer.succeed(WorkspaceMutations, mockWorkspace);
const workspaceCatalogLayer = WorkspaceCatalogLive.pipe(
  Layer.provide(workspaceLayer),
  Layer.provide(CodingAgentRepositoryLive),
  Layer.provide(NodeServices.layer),
);

const testLayer = Layer.mergeAll(
  workspaceLayer,
  workspaceCatalogLayer,
  Layer.succeed(McpServerManager, mockMcpServerManager),
  Layer.succeed(SourceHostProviders, mockSourceHostProviders),
  renderer.layer,
  CodingAgentRepositoryLive,
  NodeServices.layer,
  TestFlagsLayer(),
  FetchHttpClient.layer,
);

const runWithActions = <A, E>(
  fn: (
    actions: Effect.Success<typeof InstallMcpServerCommandWorkflowActions>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    return yield* fn(actions);
  }).pipe(Effect.provide(testLayer));

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
      const result = yield* Effect.gen(function* () {
        const actions = yield* InstallMcpServerCommandWorkflowActions;
        return yield* actions.parseArgs({
          source: "my-server",
        });
      }).pipe(Effect.provide(testLayer));
      expect(result.force).toBe(false);
    }),
  );

  it.effect("collects repeated --env flags into the parsed env record", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/mcps/my-server",
          env: ["API_KEY=abc", "REGION=us-east-1"],
        }),
      );
      expect(result.env).toEqual({ API_KEY: "abc", REGION: "us-east-1" });
    }),
  );

  it.effect("retains the requested agent subset in parsed install arguments", () =>
    Effect.gen(function* () {
      const result = yield* runWithActions((actions) =>
        actions.parseArgs({
          source: "@acme/mcps/my-server",
          agents: ["claude-code", "cursor"],
        }),
      );
      expect(result.agents).toEqual(["claude-code", "cursor"]);
    }),
  );
});

describe("parseEnvFlag", () => {
  it.effect("returns an empty record when --env is not supplied", () =>
    Effect.gen(function* () {
      expect(yield* parseEnvFlag([])).toEqual({});
    }),
  );

  it.effect("merges repeated KEY=VALUE flags", () =>
    Effect.gen(function* () {
      expect(yield* parseEnvFlag(["API_KEY=abc", "REGION=us-east-1"])).toEqual({
        API_KEY: "abc",
        REGION: "us-east-1",
      });
    }),
  );

  it.effect("lets a later occurrence of a key win", () =>
    Effect.gen(function* () {
      expect(yield* parseEnvFlag(["API_KEY=first", "API_KEY=second"])).toEqual({
        API_KEY: "second",
      });
    }),
  );

  it.effect("keeps '=' characters inside the value", () =>
    Effect.gen(function* () {
      expect(yield* parseEnvFlag(["TOKEN=a=b=c"])).toEqual({ TOKEN: "a=b=c" });
    }),
  );

  it.effect("rejects a bare key with a usage error", () =>
    Effect.gen(function* () {
      const error = yield* parseEnvFlag(["API_KEY"]).pipe(Effect.flip);
      expect(error.code).toBe("usage");
    }),
  );

  it.effect("rejects a leading '=' with a usage error", () =>
    Effect.gen(function* () {
      const error = yield* parseEnvFlag(["=value"]).pipe(Effect.flip);
      expect(error.code).toBe("usage");
    }),
  );
});

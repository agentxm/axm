import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../test-stubs.js";
import { expectNoPlanEnvelope, makeWorkspaceHandlerTestContext } from "../test-helpers.js";
import { handleListHook } from "./hooks/list.js";
import { handleListMcpServers } from "./mcps/list.js";
import { mcpRegistryResolutionKey } from "@agentxm/workspace-state";

describe("list command empty output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-empty-output-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const runEmptyList = <R>(handler: Effect.Effect<void, unknown, R>) => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handler;

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.logs).toEqual([]);
        expect(rendererState.suggestions).toEqual([]);
      }),
    );
  };

  const writeRegistryMcpWorkspace = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      agents: ["codex"],
      mcps: { context: "@acme/mcps/context" },
      lockfileMcpServers: {
        [mcpRegistryResolutionKey({
          authority: "file:///tmp/test-registry",
          owner: "@acme",
          name: "context",
        })]: {
          type: "registry",
          owner: "@acme",
          name: "context",
          resolvedVersion: "2.3.4",
          integrity: "sha512-AAAA==",
          sourceName: "agentxm",
          publisherBindingId: "hbnd_test",
        },
      },
    });
  };

  const writeCodexConfig = (lines: ReadonlyArray<string>) => {
    const configPath = path.join(tempDir, ".codex", "config.toml");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${lines.join("\n")}\n`);
  };

  it.effect("emits a single empty hooks list payload", () => runEmptyList(handleListHook()));

  it.effect("emits a single empty MCP server list payload", () =>
    runEmptyList(handleListMcpServers()),
  );

  it.effect("emits hooks rows in machine mode without a plan envelope", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      hooks: {
        "tool-audit": {
          source: "@acme/hooks/tool-audit",
          enabled: true,
        },
      },
      lockfileHooks: {
        "tool-audit": {
          type: "registry",
          owner: "@acme",
          name: "tool-audit",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          sourceName: "agentxm",
          publisherBindingId: "hbnd_test",
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListHook();

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "tool-audit",
              enabled: true,
              source: "@acme/hooks/tool-audit",
              locked: true,
              classification: { kind: "lifecycle", lifecycle: "configured" },
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  it.effect("emits MCP server rows in machine mode without a plan envelope", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      mcps: {
        context: "@acme/mcps/context",
      },
      lockfileMcpServers: {
        [mcpRegistryResolutionKey({
          authority: "file:///tmp/test-registry",
          owner: "@acme",
          name: "context",
        })]: {
          type: "registry",
          owner: "@acme",
          name: "context",
          resolvedVersion: "2.3.4",
          integrity: "sha512-AAAA==",
          sourceName: "agentxm",
          publisherBindingId: "hbnd_test",
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListMcpServers();

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              name: "context",
              enabled: true,
              version: "2.3.4",
              status: "missing",
              agentOutcomes: [
                {
                  agentId: "claude-code",
                  outcome: "failed",
                  reasonCode: "projection-missing",
                  path: ".mcp.json",
                },
              ],
              classification: { kind: "lifecycle", lifecycle: "configured" },
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  it.effect("reports a current registry-backed Codex projection with its target", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeRegistryMcpWorkspace();
    writeCodexConfig([
      "# axm:start v=1 region=mcp-server:context ext=@acme/mcps/context",
      "[mcp_servers.context]",
      'url = "https://mcp.acme.test/mcp"',
      "enabled = true",
      "",
      '[mcp_servers.context."x-axm"]',
      "v = 1",
      "managed = true",
      'ext = "@acme/mcps/context"',
      'source = "registry"',
      'ref = "@acme/mcps/context"',
      "# axm:end v=1 region=mcp-server:context ext=@acme/mcps/context",
    ]);

    return provide(
      Effect.gen(function* () {
        yield* handleListMcpServers();

        expect(rendererState.results[0]?.data).toMatchObject({
          items: [
            {
              name: "context",
              status: "enabled",
              agentOutcomes: [
                {
                  agentId: "codex",
                  outcome: "current",
                  path: ".codex/config.toml",
                },
              ],
            },
          ],
        });
      }),
    );
  });

  it.effect("reports a legacy Codex ownership fence as unmanaged", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeRegistryMcpWorkspace();
    writeCodexConfig([
      "# axm managed mcp-server context start",
      "[mcp_servers.context]",
      'url = "https://mcp.acme.test/mcp"',
      "enabled = true",
      "",
      "[mcp_servers.context.x-axm]",
      "managed = true",
      'source = "registry"',
      'ref = "@acme/mcps/context"',
      "# axm managed mcp-server context end",
    ]);

    return provide(
      Effect.gen(function* () {
        yield* handleListMcpServers();

        expect(rendererState.results[0]?.data).toMatchObject({
          items: [
            {
              name: "context",
              status: "drift",
              agentOutcomes: [
                {
                  agentId: "codex",
                  outcome: "failed",
                  reasonCode: "mcp-unmanaged",
                  path: ".codex/config.toml",
                },
              ],
            },
          ],
        });
      }),
    );
  });

  it.effect("preserves the unmanaged Codex collision classification", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeRegistryMcpWorkspace();
    writeCodexConfig([
      "[mcp_servers.context]",
      'url = "https://unmanaged.acme.test/mcp"',
      "enabled = true",
    ]);

    return provide(
      Effect.gen(function* () {
        yield* handleListMcpServers();

        expect(rendererState.results[0]?.data).toMatchObject({
          items: [
            {
              name: "context",
              status: "drift",
              agentOutcomes: [
                {
                  agentId: "codex",
                  outcome: "failed",
                  reasonCode: "mcp-unmanaged",
                  path: ".codex/config.toml",
                },
              ],
            },
          ],
        });
      }),
    );
  });
});

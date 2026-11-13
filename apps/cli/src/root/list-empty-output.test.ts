import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { afterEach, beforeEach } from "vitest";

import {
  computeMaterializedTreeIntegritySync,
  writeWorkspaceFiles,
} from "../test-support/test-stubs.js";
import {
  expectNoPlanEnvelope,
  makeWorkspaceHandlerTestContext,
} from "../test-support/test-helpers.js";
import { handleList as handleListHook } from "./hooks/list.js";
import { handleList as handleListMcpServers } from "./mcps/list.js";
import { handleLocalInspection } from "./show/command.js";
import {
  acquiredPackageRelativePath,
  McpSourceKey,
} from "@agentxm/workspace-kernel/workspace-state";
import { humanScreenLayer, makeRecordingStreams } from "../test-support/screen-harness.js";

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

  const writeRegistryMcpWorkspace = (agents: ReadonlyArray<string> = ["codex"]) => {
    const canonical = path.join(
      tempDir,
      "agent_extensions",
      Result.getOrThrow(
        acquiredPackageRelativePath(
          {
            refType: "registry",
            owner: decodeHandleSync("@acme"),
            source: {
              type: "registry",
              name: "test",
              location: decodeRegistryEndpointSync("file:///tmp/test-registry"),
              owner: Option.none(),
            },
          },
          "mcps",
          "context",
        ),
      ),
    );
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(
      path.join(canonical, "mcp.json"),
      JSON.stringify({
        owner: "@acme",
        type: "mcp-server",
        name: "context",
        version: "2.3.4",
        server: {
          name: "io.github.acme/context",
          description: "Test MCP",
          version: "2.3.4",
          remotes: [{ type: "streamable-http", url: "https://mcp.acme.test/mcp" }],
        },
      }),
    );
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      agents,
      mcps: {
        context: {
          source: "@acme/mcps/context",
          distribution: {
            kind: "remote",
            transport: "streamable-http",
            url: "https://mcp.acme.test/mcp",
          },
        },
      },
      lockfileMcpServers: {
        [McpSourceKey.encode({
          kind: "registry",
          endpoint: decodeRegistryEndpointSync("file:///tmp/test-registry"),
          owner: "@acme",
          name: "context",
        })]: {
          type: "registry",
          owner: "@acme",
          name: "context",
          resolvedVersion: "2.3.4",
          integrity: `sha512-${"A".repeat(86)}==`,
          treeIntegrity: computeMaterializedTreeIntegritySync(canonical),
          sourceName: "test",
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

  it.effect("prints MCP local names, accepted versions and missing projections on stdout", () => {
    const streams = makeRecordingStreams();
    const context = makeWorkspaceHandlerTestContext({ screenLayer: humanScreenLayer(streams) });
    writeRegistryMcpWorkspace();
    return context.provide(
      Effect.gen(function* () {
        yield* handleLocalInspection({
          selection: { kind: "all" },
          types: ["mcp-server"],
          agents: [],
        });
        const stdout = streams.lines("stdout").join("\n");
        for (const fact of ["Local name", "context", "2.3.4", "missing"])
          expect(stdout).toContain(fact);
        expect(streams.lines("stderr").join("\n")).toContain("Inspect local subjects");
      }),
    );
  });

  it.effect("gives empty human inventories a standalone result", () => {
    const streams = makeRecordingStreams();
    const context = makeWorkspaceHandlerTestContext({ screenLayer: humanScreenLayer(streams) });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    return context.provide(
      Effect.gen(function* () {
        yield* handleListHook();
        yield* handleListMcpServers({ agents: [] });
        const stdout = streams.lines("stdout").join("\n");
        expect(stdout).toContain("No hook extensions found");
        expect(stdout).toContain("No MCP servers found");
      }),
    );
  });

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
          integrity: `sha512-${"A".repeat(86)}==`,
          sourceName: "test",
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
              source: expect.objectContaining({
                kind: "registry",
                locator: "@acme/hooks/tool-audit",
              }),
              locked: true,
              management: "configured",
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  // This handler fixture provides per-agent inspection but no native location provider.
  it.effect("emits MCP server rows in machine mode without a plan envelope", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeRegistryMcpWorkspace(["claude-code"]);

    return provide(
      Effect.gen(function* () {
        yield* handleLocalInspection({
          selection: { kind: "all" },
          types: ["mcp-server"],
          agents: [],
        });

        expect(rendererState.results[0]?.data).toMatchObject({
          items: [
            {
              identity: { name: "context" },
              desired: { enabled: true },
              accepted: { state: "present", version: "2.3.4" },
              agentOutcomes: [
                {
                  agentId: "claude-code",
                  outcome: "failed",
                  reasonCode: "projection-missing",
                  path: path.join(tempDir, ".mcp.json"),
                },
              ],
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
      "[mcp_servers.context]",
      'url = "https://mcp.acme.test/mcp"',
      "enabled = true",
      "",
    ]);

    return provide(
      Effect.gen(function* () {
        yield* handleLocalInspection({
          selection: { kind: "all" },
          types: ["mcp-server"],
          agents: [],
        });

        expect(rendererState.results[0]?.data).toMatchObject({
          items: [
            {
              identity: { name: "context" },
              agentOutcomes: [
                {
                  agentId: "codex",
                  outcome: "current",
                  path: path.join(tempDir, ".codex/config.toml"),
                },
              ],
            },
          ],
        });
      }),
    );
  });

  it.effect("reports obsolete native metadata as drift regardless of comments", () => {
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
        yield* handleLocalInspection({
          selection: { kind: "all" },
          types: ["mcp-server"],
          agents: [],
        });

        expect(rendererState.results[0]?.data).toMatchObject({
          items: [
            {
              identity: { name: "context" },
              agentOutcomes: [
                {
                  agentId: "codex",
                  outcome: "failed",
                  reasonCode: "stale-projection",
                  path: path.join(tempDir, ".codex/config.toml"),
                },
              ],
            },
          ],
        });
      }),
    );
  });

  it.effect("reports differing unmarked Codex values as stale", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeRegistryMcpWorkspace();
    writeCodexConfig([
      "[mcp_servers.context]",
      'url = "https://unmanaged.acme.test/mcp"',
      "enabled = true",
    ]);

    return provide(
      Effect.gen(function* () {
        yield* handleLocalInspection({
          selection: { kind: "all" },
          types: ["mcp-server"],
          agents: [],
        });

        expect(rendererState.results[0]?.data).toMatchObject({
          items: [
            {
              identity: { name: "context" },
              agentOutcomes: [
                {
                  agentId: "codex",
                  outcome: "failed",
                  reasonCode: "stale-projection",
                  path: path.join(tempDir, ".codex/config.toml"),
                },
              ],
            },
          ],
        });
      }),
    );
  });
});

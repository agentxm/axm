/**
 * MCP-config scanner: covers the workspace `.mcp.json` plus per-agent native
 * MCP config files (`.cursor/mcp.json`, etc.). Shared surfaces are observed
 * once; agent-native surfaces retain their exact agent id.
 */

import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../../agents/registry.js";
import type { AgentDescriptor, AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { buildFixture } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeMcpConfigScanner } from "../scanners/mcp-config.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const runScanner = (
  spec: Parameters<typeof buildFixture>[0],
  options?: { readonly agentRegistry?: Readonly<Partial<Record<AgentId, AgentDescriptor>>> },
) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diag = makeDiagnostics(ref);
    const occurrences = yield* makeMcpConfigScanner(
      options?.agentRegistry === undefined
        ? {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
          }
        : {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
            agentRegistry: options.agentRegistry,
          },
    );
    return { occurrences, warnings: yield* Ref.get(ref) };
  });

layer(Path.layer, { excludeTestServices: true })("mcp-config scanner", (it) => {
  it.effect("emits no occurrences when no .mcp.json exists at any surface", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }),
  );

  it.effect("emits no occurrences for an empty shared MCP file", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          mcpJson: { _tag: "valid", contents: { mcpServers: {} } },
        },
      });

      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }),
  );

  it.effect("emits one occurrence per server in workspace .mcp.json", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          mcpJson: {
            _tag: "valid",
            contents: {
              mcpServers: {
                "server-a": { command: "echo" },
                "server-b": { command: "ls" },
              },
            },
          },
        },
      });
      const workspaceMcp = occurrences.filter((o) => o.surface._tag === "shared");
      expect(occurrences).toHaveLength(2);
      expect(workspaceMcp).toHaveLength(2);
      const names = workspaceMcp.map((o) => o.name).sort();
      expect(names).toEqual(["server-a", "server-b"]);
      for (const o of workspaceMcp) {
        expect(o._tag).toBe("mcp-config");
        expect(o.scope).toBe("project");
        expect(o.surface._tag).toBe("shared");
        expect("agentId" in o.surface).toBe(false);
        expect(o.contentLocation).toBe("/ws/.mcp.json");
      }
    }),
  );

  it.effect("emits agent-mcp-config occurrences for per-agent mcp.json files", () =>
    Effect.gen(function* () {
      // Use a single agent whose MCP target lives under its native root.
      const cursor = AGENTS["cursor"];
      const { occurrences } = yield* runScanner(
        {
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            agentDirs: {
              cursor: {
                "mcp.json": JSON.stringify({
                  mcpServers: { "cursor-srv": { command: "echo" } },
                }),
              },
            },
          },
        },
        { agentRegistry: { cursor } },
      );
      const cursorMcp = occurrences.filter(
        (o) => o.surface._tag === "agent" && o.surface.agentId === "cursor",
      );
      expect(cursorMcp).toHaveLength(1);
      expect(cursorMcp[0]?.name).toBe("cursor-srv");
      expect(cursorMcp[0]?.contentLocation).toBe("/ws/.cursor/mcp.json");
    }),
  );

  it.effect("keeps Claude's universal project .mcp.json target shared", () =>
    Effect.gen(function* () {
      const claude = AGENTS["claude-code"];
      const { occurrences } = yield* runScanner(
        {
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            mcpJson: {
              _tag: "valid",
              contents: {
                mcpServers: {
                  "claude-srv": { command: "echo" },
                },
              },
            },
          },
        },
        { agentRegistry: { "claude-code": claude } },
      );
      const claudeMcp = occurrences.filter((o) => o.surface._tag === "shared");
      expect(claudeMcp).toHaveLength(1);
      expect(claudeMcp[0]?.name).toBe("claude-srv");
      expect(claudeMcp[0]?.contentLocation).toBe("/ws/.mcp.json");
    }),
  );

  it.effect("workspace and agent occurrences for the same server name are distinct entries", () =>
    Effect.gen(function* () {
      const cursor = AGENTS["cursor"];
      const { occurrences } = yield* runScanner(
        {
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            mcpJson: {
              _tag: "valid",
              contents: { mcpServers: { shared: { command: "ws" } } },
            },
            agentDirs: {
              cursor: {
                "mcp.json": JSON.stringify({
                  mcpServers: { shared: { command: "agent" } },
                }),
              },
            },
          },
        },
        { agentRegistry: { cursor, "claude-code": AGENTS["claude-code"] } },
      );
      const shared = occurrences.filter((o) => o.name === "shared");
      expect(shared).toHaveLength(2);
      const origins = shared.map((o) => o.surface._tag).sort();
      expect(origins).toEqual(["agent", "shared"]);
      // Distinct contentLocations.
      expect(new Set(shared.map((o) => o.contentLocation)).size).toBe(2);
    }),
  );

  it.effect(
    "byte-corrupt .mcp.json publishes a parse warning and emits no entries from that surface",
    () =>
      Effect.gen(function* () {
        const { occurrences, warnings } = yield* runScanner({
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            mcpJson: { _tag: "byteCorrupt", bytes: "{ not json" },
          },
        });
        expect(occurrences).toEqual([]);
        const parseWarnings = warnings.filter(
          (w) => w.code === "scanner-parse" && w.path === "/ws/.mcp.json",
        );
        expect(parseWarnings).toHaveLength(1);
      }),
  );

  it.effect("ignores configs without mcpServers field", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          mcpJson: { _tag: "valid", contents: { somethingElse: true } },
        },
      });
      expect(occurrences).toEqual([]);
    }),
  );
});

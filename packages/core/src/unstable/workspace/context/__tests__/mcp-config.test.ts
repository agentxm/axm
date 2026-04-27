/**
 * MCP-config scanner: covers the workspace `.mcp.json` plus per-agent native
 * MCP config files (`.cursor/mcp.json`, etc.). Each occurrence carries
 * `workspace-mcp-config` (origin: "workspace") or
 * `agent-mcp-config(agentId)` (origin: "agent") origin tags.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../../agents/registry.js";
import { buildFixture } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeMcpConfigScanner } from "../scanners/mcp-config.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const runScanner = (
  spec: Parameters<typeof buildFixture>[0],
  options?: { readonly agentRegistry?: typeof AGENTS },
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

describe("mcp-config scanner", () => {
  it.effect("emits no occurrences when no .mcp.json exists at any surface", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }).pipe(Effect.provide(Path.layer)),
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
      const workspaceMcp = occurrences.filter((o) => o.origin === "workspace");
      expect(workspaceMcp).toHaveLength(2);
      const names = workspaceMcp.map((o) => o.name).sort();
      expect(names).toEqual(["server-a", "server-b"]);
      for (const o of workspaceMcp) {
        expect(o._tag).toBe("mcp-config");
        expect(o.scope).toBe("project");
        expect(o.origin).toBe("workspace");
        // Workspace variant has no `agentId` field — the union narrows on
        // `origin`. Verify by structural absence.
        expect("agentId" in o).toBe(false);
        expect(o.contentLocation).toBe("/ws/.mcp.json");
      }
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits agent-mcp-config occurrences for per-agent mcp.json files", () =>
    Effect.gen(function* () {
      // We use a synthetic registry with one agent ("claude-code") so the
      // fixture's `agentDirs` writes the agent's mcp.json under .claude/.
      const claude = AGENTS["claude-code"];
      const onlyClaude = { "claude-code": claude } as const;
      const { occurrences } = yield* runScanner(
        {
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            agentDirs: {
              "claude-code": {
                "mcp.json": JSON.stringify({
                  mcpServers: { "claude-srv": { command: "echo" } },
                }),
              },
            },
          },
        },
        { agentRegistry: { ...AGENTS, ...onlyClaude } },
      );
      const claudeMcp = occurrences.filter(
        (o) => o.origin === "agent" && o.agentId === "claude-code",
      );
      expect(claudeMcp).toHaveLength(1);
      expect(claudeMcp[0]?.name).toBe("claude-srv");
      expect(claudeMcp[0]?.contentLocation).toBe("/ws/.claude/mcp.json");
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("workspace and agent occurrences for the same server name are distinct entries", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          mcpJson: {
            _tag: "valid",
            contents: { mcpServers: { shared: { command: "ws" } } },
          },
          agentDirs: {
            "claude-code": {
              "mcp.json": JSON.stringify({
                mcpServers: { shared: { command: "agent" } },
              }),
            },
          },
        },
      });
      const shared = occurrences.filter((o) => o.name === "shared");
      expect(shared).toHaveLength(2);
      const origins = shared.map((o) => o.origin).sort();
      expect(origins).toEqual(["agent", "workspace"]);
      // Distinct contentLocations.
      expect(new Set(shared.map((o) => o.contentLocation)).size).toBe(2);
    }).pipe(Effect.provide(Path.layer)),
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
      }).pipe(Effect.provide(Path.layer)),
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
    }).pipe(Effect.provide(Path.layer)),
  );
});

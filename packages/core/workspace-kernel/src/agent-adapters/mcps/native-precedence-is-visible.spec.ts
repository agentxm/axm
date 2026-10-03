import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { resolveConfiguredMcpTargets, planMcpServerTargets } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/native-precedence-is-visible",
  title: "Competing native MCP declarations remain visible and untouched",
  statement:
    "AXM shall refuse to project beneath an observed higher-priority native declaration or an ambiguous competing reader, identify the effective winner where known, and preserve the competing file.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  boundary: "platform",
  boundaryRationale:
    "Real native files exercise the shared target planner without launching a host.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("native MCP precedence", () => {
  for (const agentId of ["claude-code", "opencode"])
    it.effect(`refuses a competing ${agentId} declaration without changing it`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-precedence-" });
        const home = path.join(root, "home");
        const project = path.join(root, "project");
        yield* fs.makeDirectory(home);
        yield* fs.makeDirectory(project);
        const configPath =
          agentId === "claude-code"
            ? path.join(home, ".claude.json")
            : path.join(project, "opencode.jsonc");
        const content = JSON.stringify(
          agentId === "claude-code"
            ? {
                projects: {
                  [project]: {
                    mcpServers: { example: { type: "http", url: "https://example.com/native" } },
                  },
                },
              }
            : {
                mcp: {
                  servers: { example: { type: "remote", url: "https://example.com/native" } },
                },
              },
        );
        yield* fs.writeFileString(configPath, content);
        const groups = yield* resolveConfiguredMcpTargets({
          agentIds: [agentId],
          scope: "project",
          workspaceRoot: project,
          nativeDirectoryInputs: { userHome: home, skillsDirectoryOverrides: {} },
        });
        const plan = planMcpServerTargets({
          groups,
          agentIds: [agentId],
          scope: "project",
          serverName: "example",
          enabled: true,
          declaration: {
            kind: "inline",
            enabled: true,
            connection: { transport: "streamable-http", url: "https://example.com/desired" },
          },
        });
        expect(plan._tag).toBe("planned");
        if (plan._tag === "planned") {
          expect(plan.writes).toEqual([]);
          expect(plan.agents[0]).toMatchObject({ _tag: "blocked" });
          expect(plan.agents[0]).toHaveProperty("reason", expect.stringContaining(configPath));
        }
        expect(yield* fs.readFileString(configPath)).toBe(content);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
});

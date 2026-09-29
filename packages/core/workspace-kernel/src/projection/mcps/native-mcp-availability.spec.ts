import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import {
  configuredMcpCapability,
  declaredMcpWriterTargets,
  planMcpServerTargets,
  removeMcpServerFromAgents,
  syncInlineMcpServerToAgents,
  type McpTargetGroup,
} from "../../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { inspectDesiredMcpServer } from "../index.js";

export const specification = defineSpecification({
  requirement: "workspace/mcps/native-availability-keeps-unverified-destinations",
  title: "MCP availability preserves every destination and unresolved native support",
  statement:
    "AXM shall distinguish unavailable native MCP support from known support whose writer or destination is unverified, retain every selected native destination in its plan, and never report an unresolved destination as current or successfully removed.",
  class: "functional",
  role: "supporting",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "Captured native configuration roots and temporary files distinguish unresolved paths from absent native output.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const entry = {
  kind: "inline",
  command: "node",
  args: ["server.js"],
  env: {},
  enabled: true,
} as const;

describe("truthful native MCP destinations", () => {
  it("keeps known support without a writer distinct from scope unsupported", () => {
    const plan = planMcpServerTargets({
      agentIds: ["amp", "hermes", "unknown-agent"],
      scope: "project",
      serverName: "context",
      declaration: entry,
      values: {},
      enabled: true,
    });
    expect(plan._tag).toBe("planned");
    if (plan._tag !== "planned") return;
    expect(plan.agents.map((agent) => [agent.agentId, agent._tag])).toEqual([
      ["amp", "unverified"],
      ["hermes", "unsupported"],
      ["unknown-agent", "unsupported"],
    ]);
    expect(plan.writes).toEqual([]);
  });
  it("preserves independently compatible targets for one agent", () => {
    const capability = configuredMcpCapability("cursor");
    if (capability === undefined) return expect.fail("Cursor writer is required");
    const native = declaredMcpWriterTargets(capability).find(
      ({ target }) => target.scope === "project",
    );
    if (native === undefined) return expect.fail("Cursor project location is required");
    const groups: ReadonlyArray<McpTargetGroup> = ["first.json", "second.json"].map(
      (path, index) => ({
        key: path,
        path,
        unverifiedReaders: [],
        members: [
          {
            agentId: "cursor",
            locationId: index === 0 ? native.location.id : "additional",
            configured: true,
            config: native.config,
            target: { ...native.target, path },
          },
        ],
      }),
    );
    const plan = planMcpServerTargets({
      groups,
      agentIds: ["cursor"],
      scope: "project",
      serverName: "context",
      declaration: entry,
      values: {},
      enabled: true,
    });
    if (plan._tag !== "planned") return expect.fail("Expected a complete native plan");
    expect(plan.agents.map((agent) => agent.target?.path)).toEqual(["first.json", "second.json"]);
    expect(plan.writes.map((write) => write.path)).toEqual(["first.json", "second.json"]);
  });
  it.effect(
    "reports unresolved captured roots without writes, current status, or successful withdrawal",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped();
        const nativeDirectoryInputs = {
          skillsDirectoryOverrides: {},
          userConfigRootOverrides: { codex: "" },
        };
        const args = { workspaceRoot, nativeDirectoryInputs, scope: "user" as const };
        const written = yield* syncInlineMcpServerToAgents(["codex"], {
          ...args,
          serverName: "context",
          entry,
          nativeInsertionEligible: true,
        });
        expect(written).toMatchObject([
          { _tag: "failed", reason: expect.stringContaining("unresolved"), targets: [] },
        ]);
        const inspection = yield* inspectDesiredMcpServer({
          ...args,
          agentIds: ["codex"],
          node: { name: "context", authority: "inline" },
          entry,
          canonicalPaths: [],
        });
        expect(inspection.current).toBe(false);
        expect(inspection.inspections).toMatchObject([{ status: "unverified" }]);
        expect(inspection.outcomes).toMatchObject([
          { outcome: "blocked", reasonCode: "mcp-unverified" },
        ]);
        const removed = yield* removeMcpServerFromAgents(["codex"], {
          ...args,
          serverName: "context",
          expectedManagedEntries: {},
        });
        expect(removed).toMatchObject([{ _tag: "failed", targets: [] }]);
        expect(yield* fs.readDirectory(workspaceRoot)).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
      ),
  );
});

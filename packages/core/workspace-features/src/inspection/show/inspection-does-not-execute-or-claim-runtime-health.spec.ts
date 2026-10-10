import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { vi } from "vitest";
import { ShowExtension } from "../index.js";
import { makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/inspection-does-not-execute-or-claim-runtime-health",
  title: "MCP inspection is passive and distinguishes runtime evidence",
  statement:
    "AXM MCP inspection shall report configuration, projection and readiness separately from runtime, leave runtime not checked, and describe host actions without launching a process, contacting the server, resolving credential values or mutating configuration.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("passive MCP inspection", () => {
  for (const connection of [
    {
      transport: "stdio",
      command: "axm-must-not-execute",
      env: { API_KEY: { env: "AXM_TEST_UNAVAILABLE_CREDENTIAL" } },
    },
    { transport: "streamable-http", url: "http://127.0.0.1:1/must-not-connect" },
  ]) {
    it.effect(`keeps ${connection.transport} runtime unchecked without invoking it`, () => {
      const fixture = makeInspectionFixture({
        settings: { agents: ["codex"], mcpServers: { probe: { connection } } },
      });
      const before = fixture.snapshot();
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        throw new Error("Passive inspection attempted HTTP");
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* ShowExtension.query({
              type: "mcp-server",
              name: "probe",
              agents: ["codex"],
            });
            expect(result.mcp?.runtime).toBe("not-checked");
            expect(result.agentOutcomes).toHaveLength(1);
            expect(result.agentOutcomes[0]).toMatchObject({
              agentId: "codex",
              runtime: "not-checked",
              readiness: "blocked",
            });
            expect(result.agentOutcomes[0]?.manualActions?.length).toBeGreaterThan(0);
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.requests).toEqual([]);
            expect(fetch).not.toHaveBeenCalled();
          }),
        )
        .pipe(
          Effect.provide(Layer.merge(NodeServices.layer, Layer.mock(ChildProcessSpawner, {}))),
          Effect.ensuring(
            Effect.sync(() => {
              fetch.mockRestore();
              fixture.cleanup();
            }),
          ),
        );
    });
  }
});

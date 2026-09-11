import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { TestFlagsLayer } from "../../../cli-flags/index.js";
import { TestMachineRenderer } from "../../../test-support/presenter-test.js";
import { AgentCapabilitiesOutputSchema, handleAgentsCapabilities } from "../capabilities.js";

export const specification = defineSpecification({
  requirement: "cli/agents/capabilities/describes-native-support-and-axm-integration",
  title: "Agent capabilities distinguish native support from AXM integration",
  statement:
    "When a person inspects a coding agent’s capabilities, AXM shall report, per extension type, whether the vendor supports it natively and separately whether AXM integrates with it, together with the applicable directory and scopes, and shall report the agent’s lifecycle rather than treating a retired agent as unknown.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The report is assembled from the shipped capability catalog and emitted through the machine Screen; it reads no workspace, so the handler over a captured Screen is the whole subject.",
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/agents/capabilities.test.ts",
    "apps/cli/src/root/agents/capabilities.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code models native Skill support that AXM integrates with, and a Hook surface AXM writes for it; Pi models a natively-supported, a plugin-only, and an absent surface in one agent.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "These cases inspect AXM's catalog report; they do not establish that the named vendors or plugins currently realize the modeled behavior.",
      retirementCondition:
        "Verify vendor interoperability through separately identified vendor/runtime evidence when making that claim.",
    },
    {
      limitation:
        "The current catalog provides no planned or unknown AXM-support row for this handler to report; those distinctions retain producer-only fixture evidence.",
      retirementCondition:
        "Exercise a real catalog row or an explicitly controlled production catalog input for each missing report distinction.",
    },
  ],
});

/** Run the report for one agent and decode the machine document it emitted. */
const reportFor = (agentId: string) =>
  Effect.gen(function* () {
    const renderer = TestMachineRenderer.make();
    yield* handleAgentsCapabilities(agentId).pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer())),
    );
    return yield* Schema.decodeUnknownEffect(AgentCapabilitiesOutputSchema)(
      renderer.state.results.at(-1)?.data,
    );
  });

describe("Coding-agent capability reports", () => {
  it.effect("distinguishes native Skill support from AXM hook writing", () =>
    Effect.gen(function* () {
      const report = yield* reportFor("claude-code");

      expect(report.agent).toBe("claude-code");
      expect(report.lifecycle).toBe("active");
      // The two axes are reported separately: the vendor supports Skills
      // natively and AXM integrates with that surface, while the Hook surface
      // exists only because AXM writes it.
      const skill = report.items.find((item) => item.type === "skill");
      expect(skill).toMatchObject({ native: "native", axm: "supported" });
      expect(skill?.directory.length, "the applicable directory").toBeGreaterThan(0);
      expect(skill?.scopes.length, "the applicable scopes").toBeGreaterThan(0);
      expect(report.items.find((item) => item.type === "hook")?.axm).toBe("writer");
    }),
  );

  it.effect("identifies a retired agent without treating it as unknown", () =>
    Effect.gen(function* () {
      const report = yield* reportFor("gemini-cli");

      expect(report.agent).toBe("gemini-cli");
      expect(report.lifecycle).toBe("retired");
      expect(report.count).toBeGreaterThan(0);
    }),
  );

  it.effect("distinguishes supported native capability from plugin and absent surfaces", () =>
    Effect.gen(function* () {
      const report = yield* reportFor("pi");

      expect(report.items.find((item) => item.type === "skill")).toMatchObject({
        native: "native",
        axm: "supported",
      });
      expect(report.items.find((item) => item.type === "subagent")).toMatchObject({
        native: "plugin",
        axm: "unsupported",
      });
      expect(report.items.find((item) => item.type === "mcp-server")).toMatchObject({
        native: "none",
        axm: "unsupported",
      });
    }),
  );
});

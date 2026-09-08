import { describe, expect, it } from "@effect/vitest";
import { agentById } from "@agentxm/extension-model/unstable/agent-capabilities";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";
import {
  handleAgentsCapabilities,
  AgentCapabilitiesOutputSchema,
} from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/agents/capabilities/describes-native-support-and-axm-integration",
  title: "Agent capabilities distinguish native support from AXM integration",
  statement:
    "When a person inspects a coding agent\u2019s capabilities, AXM shall report its modeled extension support, AXM integration, applicable directories and scopes, and lifecycle.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/agents/capabilities.internal.test.ts",
    "packages/cli/src/root/agents/capabilities.ts",
  ],
  supersedes: [],
  assumptions: [],
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

describe("Coding-agent capability reports", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect("distinguishes native Skill support from AXM hook writing", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true });
      cleanups.push(workspace.cleanup);
      const before = snapshotWorkspaceContent(workspace.root);
      yield* handleAgentsCapabilities("claude-code").pipe(Effect.provide(workspace.layer));
      const report = yield* Schema.decodeUnknownEffect(AgentCapabilitiesOutputSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
      expect(report.agent).toBe("claude-code");
      expect(report.lifecycle).toBe("active");
      expect(report.items.map((item) => item.type)).toEqual([
        "skill",
        "mcp-server",
        "subagent",
        "rule",
        "hook",
      ]);
      expect(report.items.find((item) => item.type === "skill")).toMatchObject({
        native: "native",
        axm: "supported",
        directory: ".claude/skills",
        scopes: "project, user",
      });
      expect(report.items.find((item) => item.type === "hook")?.axm).toBe("writer");
      expect(report.count).toBe(5);
      expect(report.supported).toEqual(["skill", "mcp-server", "subagent", "rule", "hook"]);
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
    }),
  );
  it.effect("identifies a retired agent without treating it as unknown", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true });
      cleanups.push(workspace.cleanup);
      yield* handleAgentsCapabilities("gemini-cli").pipe(Effect.provide(workspace.layer));
      const report = yield* Schema.decodeUnknownEffect(AgentCapabilitiesOutputSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
      expect(report.agent).toBe("gemini-cli");
      expect(report.lifecycle).toBe("retired");
      expect(report.count).toBeGreaterThan(0);
    }),
  );
  it.effect("distinguishes supported native capability from plugin and absent surfaces", () =>
    Effect.gen(function* () {
      // Pi supplies contrasting current model inputs, not a permanent vendor guarantee.
      const modeled = agentById("pi");
      expect(
        modeled.capabilities.skill,
        "Replace this fixture if the catalog distinction changes",
      ).toMatchObject({
        native: { availability: { via: "native" }, vendorStatus: { state: "active" } },
        axm: { status: "supported", writer: null },
      });
      expect(
        modeled.capabilities.subagent,
        "Replace this fixture if the catalog distinction changes",
      ).toMatchObject({
        native: { availability: { via: "plugin" }, vendorStatus: { state: "active" } },
        axm: { status: "unsupported", writer: null },
      });
      expect(
        modeled.capabilities["mcp-server"],
        "Replace this fixture if the catalog distinction changes",
      ).toMatchObject({
        native: { availability: { via: "none" }, vendorStatus: { state: "active" } },
        axm: { status: "unsupported", writer: null },
      });
      const workspace = makeSpecWorkspace({ machine: true });
      cleanups.push(workspace.cleanup);
      yield* handleAgentsCapabilities(modeled.id).pipe(Effect.provide(workspace.layer));
      const report = yield* Schema.decodeUnknownEffect(AgentCapabilitiesOutputSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
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

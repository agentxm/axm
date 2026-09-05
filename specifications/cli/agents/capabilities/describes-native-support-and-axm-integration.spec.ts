import { describe, expect, it } from "@effect/vitest";
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
});

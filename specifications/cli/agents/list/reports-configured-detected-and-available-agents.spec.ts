import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";
import {
  handleAgentsList,
  AgentsListOutputSchema,
  AgentExecutableResolver,
} from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/agents/list/reports-configured-detected-and-available-agents",
  title: "Agent inventory distinguishes configuration from detection",
  statement:
    "When a person lists coding agents, AXM shall distinguish configured membership from detected installations, identify their catalog lifecycle, show their union by default, and restrict the results to detected agents or include every configurable agent when the respective selection is requested.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/agents/list.internal.test.ts",
    "packages/cli/src/root/agents/list.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The combination of --detected and --available has no separately established user-facing meaning; precedence is not specified here.",
  ],
});

describe("Agent inventory selection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const selection of ["default", "detected", "available"] as const)
    it.effect(`reports ${selection} agents from real workspace state`, () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          settings: { agents: ["claude-code"] },
        });
        cleanups.push(workspace.cleanup);
        fs.mkdirSync(path.join(workspace.root, ".cursor"));
        const before = snapshotWorkspaceContent(workspace.root);
        yield* handleAgentsList({
          detected: selection === "detected",
          available: selection === "available",
        }).pipe(
          Effect.provideService(AgentExecutableResolver, { exists: () => Effect.succeed(false) }),
          Effect.provide(workspace.layer),
        );
        const data = yield* Schema.decodeUnknownEffect(AgentsListOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(data.configured).toEqual(["claude-code"]);
        expect(data.detected).toContain("cursor");
        const expected =
          selection === "default"
            ? ["claude-code", "cursor"]
            : selection === "detected"
              ? ["cursor"]
              : [...CONFIGURABLE_AGENT_IDS];
        expect(data.items.map((item) => item.id).sort()).toEqual(expected.sort());
        expect(data.count).toBe(expected.length);
        expect(data.items.find((item) => item.id === "cursor")).toMatchObject({
          configured: false,
          detected: true,
        });
        if (selection !== "detected")
          expect(data.items.find((item) => item.id === "claude-code")).toMatchObject({
            configured: true,
            detected: false,
          });
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
    );
  it.effect("reports an empty inventory with setup guidance", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, settings: { agents: [] } });
      cleanups.push(workspace.cleanup);
      yield* handleAgentsList({ detected: false, available: false }).pipe(
        Effect.provideService(AgentExecutableResolver, { exists: () => Effect.succeed(false) }),
        Effect.provide(workspace.layer),
      );
      const data = yield* Schema.decodeUnknownEffect(AgentsListOutputSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
      expect(data.items).toEqual([]);
      expect(data.count).toBe(0);
      expect(workspace.rendererState.suggestions).toEqual(
        expect.arrayContaining([expect.objectContaining({ cmd: "axm setup" })]),
      );
    }),
  );
  it.effect("reports configured retired agents with their lifecycle status", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        settings: { agents: ["gemini-cli", "roo"] },
      });
      cleanups.push(workspace.cleanup);
      yield* handleAgentsList({ detected: false, available: false }).pipe(
        Effect.provideService(AgentExecutableResolver, { exists: () => Effect.succeed(false) }),
        Effect.provide(workspace.layer),
      );
      const data = yield* Schema.decodeUnknownEffect(AgentsListOutputSchema)(
        workspace.rendererState.results.at(-1)?.data,
      );
      expect(data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "gemini-cli", configured: true, lifecycle: "retired" }),
          expect.objectContaining({ id: "roo", configured: true, lifecycle: "retired" }),
        ]),
      );
    }),
  );
  for (const sharedFile of ["AGENTS.md", ".mcp.json"] as const)
    it.effect(`does not attribute a shared ${sharedFile} to a coding agent`, () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, settings: { agents: [] } });
        cleanups.push(workspace.cleanup);
        fs.writeFileSync(
          path.join(workspace.root, sharedFile),
          sharedFile === "AGENTS.md" ? "Shared authored instructions.\n" : '{"mcpServers":{}}\n',
        );
        const list = handleAgentsList({ detected: true, available: false }).pipe(
          Effect.provideService(AgentExecutableResolver, { exists: () => Effect.succeed(false) }),
          Effect.provide(workspace.layer),
        );
        const before = snapshotWorkspaceContent(workspace.root);
        yield* list;
        const sharedOnly = yield* Schema.decodeUnknownEffect(AgentsListOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(sharedOnly.detected).toEqual([]);
        expect(sharedOnly.items).toEqual([]);
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);

        fs.mkdirSync(path.join(workspace.root, ".claude"));
        const corroborated = snapshotWorkspaceContent(workspace.root);
        yield* list;
        const specificEvidence = yield* Schema.decodeUnknownEffect(AgentsListOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(specificEvidence.detected).toEqual(["claude-code"]);
        expect(specificEvidence.items).toEqual([
          expect.objectContaining({ id: "claude-code", configured: false, detected: true }),
        ]);
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(corroborated);
      }),
    );
});

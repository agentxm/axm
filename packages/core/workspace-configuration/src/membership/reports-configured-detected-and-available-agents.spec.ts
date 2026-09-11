import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach } from "vitest";

import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";

import { listConfiguredAgents } from "./configure-agents.js";
import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/agents/list/reports-configured-detected-and-available-agents",
  title: "Agent inventory distinguishes configuration from detection",
  statement:
    "When a person lists coding agents, AXM shall distinguish configured membership from detected installations, identify their catalog lifecycle, show their union by default, and restrict the results to detected agents or include every configurable agent when the respective selection is requested.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/core/workspace-configuration/src/membership/configure-agents.ts"],
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

  const fixtureWith = (agents: ReadonlyArray<string>): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({ settings: { agents: [...agents] } });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  for (const selection of ["default", "detected", "available"] as const)
    it.effect(`reports ${selection} agents from real workspace state`, () => {
      const fixture = fixtureWith(["claude-code"]);
      fs.mkdirSync(path.join(fixture.root, ".cursor"));
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const inventory = yield* listConfiguredAgents({
              detected: selection === "detected",
              available: selection === "available",
            });

            expect(inventory.configured).toEqual(["claude-code"]);
            expect(inventory.detected).toContain("cursor");
            const expected =
              selection === "default"
                ? ["claude-code", "cursor"]
                : selection === "detected"
                  ? ["cursor"]
                  : [...CONFIGURABLE_AGENT_IDS];
            expect(inventory.items.map((item) => item.id).sort()).toEqual(expected.sort());
            expect(inventory.count).toBe(expected.length);
            expect(inventory.items.find((item) => item.id === "cursor")).toMatchObject({
              configured: false,
              detected: true,
            });
            if (selection !== "detected")
              expect(inventory.items.find((item) => item.id === "claude-code")).toMatchObject({
                configured: true,
                detected: false,
              });
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });

  // The setup guidance an empty inventory carries is rendering, and is
  // observed beside the renderer in apps/cli/src/root/agents/list.test.ts.
  it.effect("reports an empty inventory", () => {
    const fixture = fixtureWith([]);
    return fixture
      .provide(
        Effect.gen(function* () {
          const inventory = yield* listConfiguredAgents();

          expect(inventory.items).toEqual([]);
          expect(inventory.count).toBe(0);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports configured retired agents with their lifecycle status", () => {
    const fixture = fixtureWith(["gemini-cli", "roo"]);
    return fixture
      .provide(
        Effect.gen(function* () {
          const inventory = yield* listConfiguredAgents();

          expect(inventory.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: "gemini-cli", configured: true, lifecycle: "retired" }),
              expect.objectContaining({ id: "roo", configured: true, lifecycle: "retired" }),
            ]),
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  for (const sharedFile of ["AGENTS.md", ".mcp.json"] as const)
    it.effect(`does not attribute a shared ${sharedFile} to a coding agent`, () => {
      const fixture = fixtureWith([]);
      fixture.writeFile(
        sharedFile,
        sharedFile === "AGENTS.md" ? "Shared authored instructions.\n" : '{"mcpServers":{}}\n',
      );
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();

            const sharedOnly = yield* listConfiguredAgents({ detected: true });

            expect(sharedOnly.detected).toEqual([]);
            expect(sharedOnly.items).toEqual([]);
            expect(fixture.snapshot()).toEqual(before);

            fs.mkdirSync(path.join(fixture.root, ".claude"));
            const corroborated = fixture.snapshot();

            const specificEvidence = yield* listConfiguredAgents({ detected: true });

            expect(specificEvidence.detected).toEqual(["claude-code"]);
            expect(specificEvidence.items).toEqual([
              expect.objectContaining({ id: "claude-code", configured: false, detected: true }),
            ]);
            expect(fixture.snapshot()).toEqual(corroborated);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
});

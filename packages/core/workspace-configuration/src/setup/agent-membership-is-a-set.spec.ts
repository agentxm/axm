import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSetupFixture, type SetupFixture } from "../testing.js";
import { runSetup } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/setup/agent-membership-is-a-set",
  title: "Setup treats coding-agent membership as a set",
  statement:
    "When setup resolves coding-agent membership, it shall offer each configurable agent exactly once however many configuration, detection, or suggestion sources name that agent, and shall record the resolved membership as a set, so overlapping evidence or a repeated request never yields a duplicated agent or an unwritable workspace.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["packages/core/workspace-configuration/src/setup/initialization.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const readSettings = (fixture: SetupFixture): unknown => JSON.parse(fixture.readFile("axm.json"));

describe("Coding-agent membership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const request = (fixture: SetupFixture, over: Record<string, unknown> = {}) => ({
    scope: "project" as const,
    scopeExplicit: true,
    nonInteractive: false,
    projectRoot: decodeAbsolutePathSync(fixture.root),
    telemetryEnabled: false,
    ...over,
  });

  it.effect("offers each agent once when detection and suggestion name the same agent", () => {
    // Workstation evidence with no project evidence is the case that makes the
    // sources overlap: the agent is detected on the workstation and is also
    // named by the catalog suggestion the empty project falls back to.
    const fixture = makeSetupFixture({ selectAgents: ["claude-code"] });
    cleanups.push(fixture.cleanup);
    fs.mkdirSync(path.join(fixture.home, ".claude"), { recursive: true });

    return fixture
      .provide(
        Effect.gen(function* () {
          yield* runSetup(request(fixture));

          const offer = fixture.promptState().selectAgentsCalls[0];
          expect(offer?.userDetectedIds).toContain("claude-code");
          expect(offer?.suggestedIds).toContain("claude-code");
          const offered = offer?.allAgents.map((agent) => agent.id) ?? [];
          expect(offered.filter((id) => id === "claude-code")).toEqual(["claude-code"]);
          expect(offered).toHaveLength(new Set(offered).size);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("records a repeated selection once", () => {
    const fixture = makeSetupFixture({
      selectAgents: ["claude-code", "codex", "claude-code"],
    });
    cleanups.push(fixture.cleanup);

    return fixture
      .provide(
        Effect.gen(function* () {
          yield* runSetup(request(fixture));

          expect(readSettings(fixture)).toMatchObject({ agents: ["claude-code", "codex"] });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("records a repeated request once", () => {
    const fixture = makeSetupFixture();
    cleanups.push(fixture.cleanup);

    return fixture
      .provide(
        Effect.gen(function* () {
          const settled = yield* runSetup(
            request(fixture, {
              agents: ["claude-code", "claude-code"],
              yes: true,
              nonInteractive: true,
            }),
          );

          expect(readSettings(fixture)).toMatchObject({ agents: ["claude-code"] });
          expect(settled).toMatchObject({
            outcome: {
              status: "initialized",
              agents: [{ id: "claude-code", name: "Claude Code" }],
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});

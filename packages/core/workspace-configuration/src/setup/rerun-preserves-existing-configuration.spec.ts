import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSetupFixture } from "../testing.js";
import { runSetup } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/setup/rerun-preserves-existing-configuration",
  title: "Repeated setup preserves the existing workspace",
  statement:
    "When setup runs against an initialized workspace, AXM shall preserve its settings, lockfile, authored content, and agent outputs even if different agents are supplied, directing membership changes to the agent commands.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/setup/initializes-selected-workspace"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Repeated setup", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("does not turn rerun options into a membership change", () => {
    const fixture = makeSetupFixture();
    cleanups.push(fixture.cleanup);
    const request = (agents: ReadonlyArray<string>) => ({
      scope: "project" as const,
      scopeExplicit: true,
      agents,
      yes: true,
      nonInteractive: true,
      projectRoot: decodeAbsolutePathSync(fixture.root),
      telemetryEnabled: false,
    });

    return fixture
      .provide(
        Effect.gen(function* () {
          yield* runSetup(request(["claude-code"]));
          fixture.writeFile("notes.md", "Authored notes");
          const before = fixture.snapshot();

          const rerun = yield* runSetup(request(["cursor"]));

          expect(fixture.snapshot()).toEqual(before);
          expect(rerun).toMatchObject({
            outcome: {
              status: "already-initialized",
              changed: false,
              message: expect.stringContaining("axm agents add"),
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});

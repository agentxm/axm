import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { readSettings } from "../install/test-helpers.js";
import { snapshotContent } from "../demote/test-helpers.js";
import {
  applyUnpack,
  makePackWorld,
  seedAuthoredPackWorkspace,
  MEMBER_VERSION,
  PACK,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/packs/unpack/promotes-members-without-overwriting-direct-intent",
  title: "Unpack keeps members installed as direct declarations",
  statement:
    "When a person unpacks a configured pack with complete member resolutions, AXM shall preserve its installed leaf members as direct workspace declarations, retain existing direct declarations unchanged, and remove the pack declaration.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const MEMBER_CANONICAL = "agent_extensions/agentxm/@acme/skills";

describe("Unpacking a pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const direct of [false, true])
    it.effect(`preserves members with existing direct declarations=${direct}`, () => {
      const world = makePackWorld(cleanups);
      const directEntry = { source: `@acme/skills/review@${MEMBER_VERSION}`, enabled: false };
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* seedAuthoredPackWorkspace(
              world,
              direct ? { skills: { review: directEntry } } : {},
            );
            const membersBefore = snapshotContent(
              nodePath.join(world.workspace.root, MEMBER_CANONICAL),
            );

            const resolution = yield* applyUnpack({ name: PACK });

            expect(resolution.name).toBe("Unpack pack");
            expect(deriveOperationOutcome(resolution)).toBe("applied");

            const settings = readSettings(world.workspace);
            expect(settings).toMatchObject({
              skills: {
                review: direct ? directEntry : expect.stringContaining("@acme/skills/review"),
                "test-helper": expect.stringContaining("@acme/skills/test-helper"),
              },
            });
            expect(JSON.stringify(settings)).not.toContain(`"${PACK}"`);
            // Member content and accepted resolutions are inherited, not
            // re-acquired: nothing under the members' canonical root moved.
            expect(snapshotContent(nodePath.join(world.workspace.root, MEMBER_CANONICAL))).toEqual(
              membersBefore,
            );
            const lock = world.workspace.readFile("axm-lock.yaml");
            expect(lock).toContain("review:");
            expect(lock).toContain("test-helper:");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
});

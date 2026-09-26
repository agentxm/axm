import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applyExecution,
  authoringWorkspaceLayer,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { makePackWorkspace } from "../test-support/pack-membership.js";
import { ChangePackMembership } from "./change-pack-membership.js";

export const specification = defineSpecification({
  requirement: "cli/packs/add/records-member-as-pack-dependency",
  title: "Adding an installed extension to an authored pack records it as a pack dependency",
  statement:
    "When a person adds a versioned installed extension to a workspace-authored pack, AXM shall record a dependency whose lower bound is the member’s accepted installed version, or its manifest version when workspace authored.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "The version a dependency records is read from the workspace's own accepted resolution or authored manifest, and written into the pack manifest by the membership use case; a real project directory observes both sides.",
  derivedFrom: ["cli/packs/authored-packs-expand-membership"],
  supersedes: ["cli/packs/authored-packs-expand-membership"],
  assumptions: [],
  openQuestions: [],
});

describe("Adding a member to a workspace-authored pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const addToPack = (created: AuthoringWorkspace, selector: string) =>
    Effect.gen(function* () {
      const candidate = yield* ChangePackMembership.prepare({
        change: "add",
        pack: "toolkit",
        selector,
      });
      if (candidate._tag === "NoChange") throw new Error("Expected a membership change");
      return yield* ChangePackMembership.previewOrApply(candidate, applyExecution);
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  it.effect("adding an installed extension records it as a pack dependency", () =>
    Effect.gen(function* () {
      const { created, seed } = makePackWorkspace({
        pack: "toolkit",
        members: [{ type: "skill", name: "member-skill", version: "1.0.0", source: "registry" }],
      });
      cleanups.push(created.cleanup);
      yield* seed;

      yield* addToPack(created, "@acme/skills/member-skill");

      expect(JSON.parse(created.read("packs/toolkit/pack.json") ?? "null")).toMatchObject({
        dependencies: { "@acme/skills/member-skill": ">=1.0.0" },
      });
    }),
  );

  it.effect(
    "uses the authored manifest version without creating an accepted external resolution",
    () =>
      Effect.gen(function* () {
        const { created, seed } = makePackWorkspace({
          pack: "toolkit",
          members: [
            { type: "skill", name: "authored-member", version: "4.5.6", source: "workspace" },
          ],
        });
        cleanups.push(created.cleanup);
        yield* seed;
        const lockBefore = created.lockfileText();
        expect(lockBefore).not.toContain("authored-member:");

        yield* addToPack(created, "@acme/skills/authored-member");

        expect(JSON.parse(created.read("packs/toolkit/pack.json") ?? "null")).toMatchObject({
          dependencies: { "@acme/skills/authored-member": ">=4.5.6" },
        });
        expect(created.lockfileText()).toBe(lockBefore);
      }),
  );
});

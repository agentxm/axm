import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceEnvironment,
  authoringWorkspaceLayer,
  previewExecution,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { makePackWorkspace } from "../test-support/pack-membership.js";
import { ChangePackMembership } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/packs/remove/preview-is-pure",
  title: "Pack remove preview describes the removal without changing any state",
  statement:
    "When packs remove runs in preview mode against a recorded member, it shall report the dependency it would remove with a previewed outcome and shall not change the pack manifest, settings, the lockfile, or any installed content.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the membership use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.",
  derivedFrom: ["cli/packs/add/records-member-as-pack-dependency"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack remove preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A workspace whose authored pack already records one acquired Registry skill. */
  const packWithMember = () =>
    Effect.gen(function* () {
      const { created, seed } = makePackWorkspace({
        pack: "toolkit",
        members: [{ type: "skill", name: "member-skill", version: "1.0.0", source: "registry" }],
      });
      cleanups.push(created.cleanup);
      yield* seed;
      yield* Effect.gen(function* () {
        const candidate = yield* ChangePackMembership.prepare({
          change: "add",
          pack: "toolkit",
          selector: "@acme/skills/member-skill",
        });
        if (candidate._tag === "NoChange") throw new Error("Expected a membership change");
        return yield* ChangePackMembership.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
      expect(created.read("packs/toolkit/pack.json")).toContain("@acme/skills/member-skill");
      return created;
    });

  const previewRemoval = (created: AuthoringWorkspace, selector: string) => {
    const environment = authoringWorkspaceEnvironment(created);
    return {
      environment,
      run: Effect.gen(function* () {
        const candidate = yield* ChangePackMembership.prepare({
          change: "remove",
          pack: "toolkit",
          selector,
        });
        if (candidate._tag === "NoChange") throw new Error("Expected a membership change");
        return yield* ChangePackMembership.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.provide(environment.layer)),
    };
  };

  it.effect("a previewed remove of a recorded member changes no protected state", () =>
    Effect.gen(function* () {
      const created = yield* packWithMember();
      const before = created.snapshot();
      const { environment, run } = previewRemoval(created, "@acme/skills/member-skill");

      const resolution = yield* run;

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toMatchObject([
        {
          state: "ready",
          artifact: {
            packMembership: {
              pack: "@acme/packs/toolkit",
              members: [{ member: "@acme/skills/member-skill", before: ">=1.0.0", after: null }],
            },
          },
        },
      ]);
      expect(created.snapshot()).toEqual(before);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect(
    "a previewed remove that matches no member reports the failure and changes nothing",
    () =>
      Effect.gen(function* () {
        const created = yield* packWithMember();
        const before = created.snapshot();
        const { environment, run } = previewRemoval(created, "@acme/skills/absent-*");

        const failure = yield* run.pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "PackMemberNotDeclared",
          selector: "@acme/skills/absent-*",
        });
        expect(created.snapshot()).toEqual(before);
        expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
      }),
  );
});

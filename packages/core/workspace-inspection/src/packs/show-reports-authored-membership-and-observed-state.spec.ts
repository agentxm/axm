import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ShowPack } from "./show-pack.js";
import { makeAcceptedPackFixture, makeAuthoredPackFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/packs/show/reports-authored-membership-and-observed-state",
  title: "Pack inspection reports declared members and observed state",
  statement:
    "When inspecting a configured pack, AXM shall report the pack\u2019s source authority, canonical manifest, declared member constraints, and desired dependency reachability.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-inspection/src/packs/show-pack.ts",
    "apps/cli-e2e/src/scope-consistency.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The current pack result reports member version as null and derives reachability from desired graph presence. Should future inspection distinguish desired membership from verified installed member resolution and exclusions?",
  ],
});

describe("Pack state inspection", () => {
  for (const target of ["toolkit", "@acme/packs/toolkit"])
    it.effect(target, () => {
      const fixture = makeAuthoredPackFixture({
        dependencies: {
          "@acme/skills/review": ">=1.2.3",
          "@acme/skills/test-helper": ">=1.2.3",
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const result = yield* ShowPack.query({ target });
            expect(result).toMatchObject({
              scope: "project",
              pack: "@acme/packs/toolkit",
              sourceAuthority: "workspace",
              manifestVersion: "0.0.1",
              acceptedResolution: "authored",
              desiredDependencies: expect.arrayContaining([
                expect.objectContaining({
                  fqn: "@acme/skills/review",
                  constraint: ">=1.2.3",
                  reachability: "satisfying",
                }),
                expect.objectContaining({
                  fqn: "@acme/skills/test-helper",
                  constraint: ">=1.2.3",
                  reachability: "satisfying",
                }),
              ]),
            });
            expect(result.canonicalPath).toBe(`${fixture.root}/packs/toolkit/pack.json`);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  it.effect("reports a Registry pack's accepted resolution", () => {
    const fixture = makeAcceptedPackFixture();
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ShowPack.query({ target: "@acme/packs/toolkit" });
          expect(result).toMatchObject({
            pack: "@acme/packs/toolkit",
            sourceAuthority: "registry",
            acceptedResolution: "accepted",
            manifestVersion: "2.3.4",
            desiredDependencies: [],
          });
          expect(result.canonicalPath).toBe(
            `${fixture.root}/agent_extensions/agentxm/@acme/packs/toolkit/pack.json`,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

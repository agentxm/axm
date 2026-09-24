import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ShowPack } from "./show-pack.js";
import {
  makeAcceptedPackFixture,
  makeAuthoredPackFixture,
  makeInspectionFixture,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/packs/show/reports-authored-membership-and-observed-state",
  title: "Pack inspection reports declared members and observed state",
  statement:
    "When inspecting a configured pack, AXM shall report the pack\u2019s source authority, canonical manifest, declared member constraints, and each declared member\u2019s desired reachability, judged from the canonical observation of the member: satisfying when the member is desired and its accepted or authored version is inside this pack\u2019s range, excluded when that version is outside it, and missing when no desired route reaches it.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace/src/inspection/packs/show-pack.ts",
    "apps/cli-e2e/src/scope-consistency.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
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

  it.effect("reports a member the pack's own range excludes, with the version it judged", () => {
    const fixture = makeInspectionFixture({
      settings: {
        agents: [],
        owner: "@acme",
        packs: { toolkit: { source: "workspace", enabled: true } },
        skills: { review: { source: "workspace", enabled: true } },
      },
      files: {
        "packs/toolkit/pack.json": JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "0.0.1",
          dependencies: { "@acme/skills/review": ">=2.0.0" },
        }),
        "skills/review/skill.json": JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.5.0",
        }),
        "skills/review/src/SKILL.md": "---\nname: review\ndescription: Review\n---\n# review\n",
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ShowPack.query({ target: "toolkit" });
          expect(result.desiredDependencies).toEqual([
            {
              fqn: "@acme/skills/review",
              constraint: ">=2.0.0",
              version: "1.5.0",
              source: "workspace",
              reachability: "excluded",
            },
          ]);
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
            `${fixture.root}/agent_extensions/registry/@acme/packs/toolkit/pack.json`,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

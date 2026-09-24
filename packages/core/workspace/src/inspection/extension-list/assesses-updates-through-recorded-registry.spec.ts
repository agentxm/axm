import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { makeRegistrySkillLockEntry } from "../../desired-state/testing.js";
import { ListExtensions } from "./list-extensions.js";
import {
  inspectionRegistryUrl,
  makeInspectionFixture,
  makeInstalledSkillFixture,
  publishedSkillIndex,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/assesses-updates-through-recorded-registry",
  title: "Update listings use each installation\u2019s recorded Registry",
  statement:
    "When listing outdated extensions, AXM shall assess installed extensions, including disabled installations, against their recorded Registry source and return those with a newer version that satisfies the extension\u2019s effective constraint: the intersection of its direct declaration and every Pack that requires it.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/list/command.test.ts",
    "packages/core/workspace/src/inspection/extension-list/list-extensions.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Should Git update assessment treat a changed commit with an unchanged extension tree as an available update? Current code compares both identities; Registry version eligibility is the accepted scope of this requirement.",
  ],
});

describe("Recorded Registry update assessment", () => {
  it.effect(
    "assesses a disabled installation after its Registry publishes a newer matching version",
    () => {
      const fixture = makeInstalledSkillFixture({ enabled: false });
      return fixture
        .provide(
          Effect.gen(function* () {
            fixture.publish({
              versions: [
                { version: "1.1.0", published: "2026-02-01T00:00:00.000Z" },
                { version: "1.0.0", published: "2026-01-01T00:00:00.000Z" },
              ],
            });
            const available = yield* ListExtensions.query({ filter: "outdated" });
            expect(available.document).toMatchObject({
              filter: "outdated",
              count: 1,
              coverage: { eligible: 1, checked: 1, unknown: 0 },
              items: [
                {
                  name: "review",
                  enabled: false,
                  installed: true,
                  assessment: {
                    state: "available",
                    installedVersion: "1.0.0",
                    latestMatching: "1.1.0",
                  },
                },
              ],
            });

            // A newer release outside the recorded constraint is not an update.
            fixture.publish({
              versions: [
                { version: "2.0.0", published: "2026-02-01T00:00:00.000Z" },
                { version: "1.0.0", published: "2026-01-01T00:00:00.000Z" },
              ],
            });
            const ineligible = yield* ListExtensions.query({ filter: "outdated" });
            expect(ineligible.document).toMatchObject({
              count: 0,
              items: [],
              coverage: { eligible: 1, checked: 1, unknown: 0 },
            });

            // Every request went to the recorded Registry source, never elsewhere.
            expect(fixture.requests.length).toBeGreaterThan(0);
            for (const request of fixture.requests)
              expect(request.url).toContain("/v1/extensions/%40acme/skills/review");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );

  it.effect(
    "assesses a Pack-narrowed member within its effective range, never its declared one",
    () => {
      const fixture = makeInspectionFixture({
        settings: {
          agents: ["claude-code"],
          owner: "@acme",
          sources: [{ name: "company", type: "registry", location: inspectionRegistryUrl }],
          skills: { review: { source: "company:@acme/skills/review@^1.0.0", enabled: true } },
          packs: { narrow: { source: "workspace", enabled: true } },
        },
        lockfile: {
          skills: {
            review: makeRegistrySkillLockEntry({
              owner: decodeHandleSync("@acme"),
              name: "review",
              sourceName: "company",
              endpoint: new URL(inspectionRegistryUrl),
            }),
          },
        },
        files: {
          "agent_extensions/company/@acme/skills/review/SKILL.md":
            "---\nname: review\ndescription: Review guidance\n---\n# Review\n",
          "packs/narrow/pack.json": JSON.stringify({
            owner: "@acme",
            type: "pack",
            name: "narrow",
            version: "1.0.0",
            dependencies: { "@acme/skills/review": "~1.0.0" },
          }),
        },
        respond: () => ({
          body: publishedSkillIndex({
            versions: [
              { version: "1.1.0", published: "2026-03-01T00:00:00.000Z" },
              { version: "1.0.5", published: "2026-02-01T00:00:00.000Z" },
              { version: "1.0.0", published: "2026-01-01T00:00:00.000Z" },
            ],
          }),
        }),
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const available = yield* ListExtensions.query({ filter: "outdated" });
            // The declared `^1.0.0` alone would offer 1.1.0; the Pack's `~1.0.0`
            // narrows the effective range, so `axm update` and this listing agree.
            expect(available.document).toMatchObject({
              count: 1,
              items: [
                {
                  name: "review",
                  assessment: {
                    state: "available",
                    installedVersion: "1.0.0",
                    latestMatching: "1.0.5",
                    latestAvailable: "1.1.0",
                  },
                },
              ],
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
});

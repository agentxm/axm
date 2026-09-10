import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./list-extensions.js";
import { makeInstalledSkillFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/reports-incomplete-assessment",
  title: "List reports incomplete Registry assessment",
  statement:
    "When an installation\u2019s recorded Registry source is not configured or its extension index is not found, AXM shall mark that assessment as unknown in coverage instead of treating it as a confirmed current installation.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/list/command.test.ts",
    "packages/core/workspace-inspection/src/extension-list/list-extensions.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Incomplete Registry assessment", () => {
  for (const filter of ["outdated", "deprecated"] as const)
    for (const missing of ["index", "source"] as const)
      it.effect(`${filter}: missing ${missing}`, () => {
        const fixture = makeInstalledSkillFixture({
          // The recorded source is unconfigured, or its index is absent.
          ...(missing === "source" ? { sources: [] } : {}),
          respond: () => ({
            status: 404,
            body: {
              kind: "NotFoundError",
              type: "about:blank",
              title: "Extension not found",
              status: 404,
              code: "extension_not_found",
              detail: "Fixture extension not found",
            },
          }),
        });
        return fixture
          .provide(
            Effect.gen(function* () {
              const result = yield* ListExtensions.query({ filter });
              expect(result.document).toMatchObject({
                filter,
                count: 0,
                items: [],
                coverage: { eligible: 1, checked: 0, unknown: 1 },
              });
            }),
          )
          .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
      });
});

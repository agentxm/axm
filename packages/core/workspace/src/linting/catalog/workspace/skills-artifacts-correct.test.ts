import { describe, expect, it } from "@effect/vitest";
import { desiredConstraintOf } from "../../../desired-state/testing.js";
import * as Effect from "effect/Effect";

import type { DesiredExtensionNode } from "../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { skillsArtifactsCorrectConformance } from "./conformance/extensions/test-helpers.js";
import { skillsArtifactsCorrectRule } from "./skills-artifacts-correct.js";

const desiredReviewer = {
  type: "skill",
  name: "reviewer",
  identity: "@acme/skills/reviewer",
  source: "@acme/skills/reviewer@^1.0.0",
  enabled: true,
  constraint: desiredConstraintOf("^1.0.0"),
  origins: [
    {
      type: "settings",
      localName: "reviewer",
      authority: "sourced",
      source: "@acme/skills/reviewer@^1.0.0",
      enabled: true,
      constraint: "^1.0.0",
    },
  ],
} satisfies DesiredExtensionNode;

/** The unprojected reviewer, observed with the given canonical state. */
const observedUnprojectedReviewer = (
  status: "missing-resolution" | "missing" | "usable" | "incomplete" | "corrupt",
) =>
  Effect.map(
    skillsArtifactsCorrectConformance.violated(),
    (context) =>
      ({
        ...context,
        health: {
          desiredState: Effect.succeed({
            complete: true,
            nodes: [desiredReviewer],
            mcpSourceClosures: [],
            problems: [],
          }),
          canonicalObservations: Effect.succeed([
            {
              desired: desiredReviewer,
              observation: { type: "skill", name: "reviewer", status },
            },
          ]),
        },
      }) satisfies WorkspaceRuleContext,
  );

describe("workspace/skills-artifacts-correct", () => {
  it.effect.each(["missing-resolution", "missing"] as const)(
    "defers to a %s observation, whose one finding covers the absent artifacts",
    (status) =>
      Effect.gen(function* () {
        const context = yield* observedUnprojectedReviewer(status);

        expect(yield* skillsArtifactsCorrectRule.check(context)).toEqual([]);
      }),
  );

  it.effect.each(["usable", "incomplete", "corrupt"] as const)(
    "reports absent artifacts of a skill whose canonical content is present and %s",
    (status) =>
      Effect.gen(function* () {
        const context = yield* observedUnprojectedReviewer(status);

        expect(
          (yield* skillsArtifactsCorrectRule.check(context)).map((finding) => finding.message),
        ).toEqual([
          "Skill 'reviewer' is enabled, but it is missing from declared agents: claude-code.",
        ]);
      }),
  );
});

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import { writeAuthoredPack, writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/reports-pack-resolution-differences",
  title: "Publication reports differing workspace and consumer versions",
  statement:
    "When an admitted authored pack has a dependency whose effective Registry version differs from the satisfying version in this workspace, publish shall report both versions and the dependency constraint as a warning with guidance for reconciling the difference, without treating that warning as a publication failure.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/publish/command.internal.test.ts",
    "packages/cli/src/root/publish/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack dependency resolution advisories", () => {
  for (const scenario of [
    { name: "pack only with differing resolution", localVersion: "1.1.0", includeUnrelated: false },
    {
      name: "pack plus another extension with differing resolution",
      localVersion: "1.1.0",
      includeUnrelated: true,
    },
    {
      name: "matching workspace and Registry versions",
      localVersion: "1.0.0",
      includeUnrelated: false,
    },
  ]) {
    it.effect(scenario.name, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: { skills: { review: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          yield* context.run();
          const oldRelease = context.archive("review");
          context.workspace.writeSettings({
            owner: "@acme",
            agents: [],
            skills: { review: "workspace", deploy: "workspace" },
            packs: { reviewers: "workspace" },
          });
          writeAuthoredSkill(context.workspace.root, {
            name: "review",
            version: scenario.localVersion,
          });
          writeAuthoredSkill(context.workspace.root, { name: "deploy" });
          writeAuthoredPack(context.workspace.root, {
            name: "reviewers",
            dependencies: { "@acme/skills/review": "^1.0.0" },
          });
          const selectors = scenario.includeUnrelated
            ? ["@acme/packs/reviewers", "@acme/skills/deploy"]
            : ["@acme/packs/reviewers"];
          for (const preview of [true, false]) {
            yield* context.run({ selectors, preview });
            const result = yield* context.result();
            const pack = result.execution.outcomes.find(
              (outcome) => outcome.id === "@acme/packs/reviewers",
            );
            const warnings =
              pack?.findings?.filter(
                (finding) => finding.ruleId === "pack/publish-resolution-divergence",
              ) ?? [];
            expect(pack?.status).toBe(preview ? "pending" : "success");
            if (scenario.localVersion === "1.0.0") expect(warnings).toEqual([]);
            else
              expect(warnings).toEqual([
                {
                  ruleId: "pack/publish-resolution-divergence",
                  severity: "warning",
                  message:
                    "@acme/packs/reviewers resolves @acme/skills/review@1.1.0 in this workspace, while Registry consumers resolve @acme/skills/review@1.0.0 within ^1.0.0.",
                  suggestions: [
                    {
                      description:
                        "Publish @acme/skills/review before publishing the pack if consumers should receive the workspace version",
                      cmd: "axm publish @acme/skills/review",
                    },
                  ],
                },
              ]);
          }
          expect(context.archive("review")).toEqual(oldRelease);
          expect(context.archive("reviewers", "1.0.0", "packs").length).toBeGreaterThan(0);
          expect(
            context.registry.storedFiles().some((file) => file.endsWith("review/1.1.0.zip")),
          ).toBe(false);
        }),
      ),
    );
  }
});

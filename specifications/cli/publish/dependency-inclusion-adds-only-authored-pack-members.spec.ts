import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import { writeAuthoredPack, writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/dependency-inclusion-adds-only-authored-pack-members",
  title: "Pack dependency inclusion adds only workspace-authored members",
  statement:
    "For a selected pack, publish shall add its workspace-authored dependencies only when dependency inclusion is explicitly requested, retain external dependencies as Registry references, and leave unrelated authored extensions outside the selection.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["decision-table", "example"],
  derivedFrom: ["packages/cli/help/topics/publish.md", "packages/cli/src/root/publish/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selected pack dependency inclusion", () => {
  for (const includeDependencies of [false, true]) {
    it.effect(
      `dependency inclusion ${includeDependencies ? "adds the authored member" : "does not widen selection"}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* makePublicationSpecContext({
              settings: {
                skills: { review: "workspace", external: "workspace", unrelated: "workspace" },
                packs: { toolkit: "workspace" },
              },
            });
            for (const name of ["review", "external", "unrelated"])
              writeAuthoredSkill(context.workspace.root, { name });
            writeAuthoredPack(context.workspace.root, {
              name: "toolkit",
              dependencies: { "@acme/skills/review": "^1.0.0", "@acme/skills/external": "^1.0.0" },
            });
            yield* context.run({ selectors: ["@acme/skills/review", "@acme/skills/external"] });
            const externalArchive = context.archive("external");
            context.workspace.writeSettings({
              owner: "@acme",
              agents: [],
              skills: {
                review: "workspace",
                external: "@acme/skills/external",
                unrelated: "workspace",
              },
              packs: { toolkit: "workspace" },
            });
            writeAuthoredSkill(context.workspace.root, { name: "review", version: "1.1.0" });
            yield* context.run({
              selectors: ["@acme/packs/toolkit"],
              includeDependencies,
              acceptWarnings: true,
            });
            const result = yield* context.result();
            const published = result.execution.outcomes
              .filter(({ action, status }) => action === "publish" && status === "success")
              .map(({ id }) => id)
              .sort();
            expect(published).toEqual(
              includeDependencies
                ? ["@acme/packs/toolkit", "@acme/skills/review"]
                : ["@acme/packs/toolkit"],
            );
            expect(context.archive("external")).toEqual(externalArchive);
            expect(
              context.registry.storedFiles().some((file) => file.includes("/unrelated/")),
            ).toBe(false);
            expect(context.registry.storedFiles()).toContain(
              "extensions/@acme/packs/toolkit/1.0.0.zip",
            );
            expect(
              context.registry.storedFiles().includes("extensions/@acme/skills/review/1.1.0.zip"),
            ).toBe(includeDependencies);
          }),
        ),
    );
  }
});

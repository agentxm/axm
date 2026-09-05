import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAppError } from "axm.sh/specification-harness";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/archives-satisfy-distribution-contract",
  title: "Publication refuses incomplete or unsafe archives",
  statement:
    "Before uploading an extension, publish shall reject an archive that omits a required package file or includes a node_modules entry or .env file, identify the invalid path, and give removal guidance for unsafe entries.",
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

describe("Publication archive admission", () => {
  for (const scenario of [
    {
      name: "required skill content ignored",
      ignore: ["src/SKILL.md"],
      extra: undefined,
      message: "src/SKILL.md is required",
    },
    {
      name: "dependency directory included",
      ignore: [],
      extra: "node_modules/leftover.js",
      message: "node_modules/leftover.js",
    },
    { name: "environment file included", ignore: [], extra: ".env", message: ".env" },
  ]) {
    it.effect(scenario.name, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            machine: false,
            settings: { skills: { review: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, {
            name: "review",
            publishIgnore: scenario.ignore,
          });
          if (scenario.extra !== undefined) {
            const file = path.join(context.workspace.root, "skills", "review", scenario.extra);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, "SYNTHETIC_PACKAGE_CONTENT");
          }
          const error = getAppError(
            yield* context.run({ selectors: ["@acme/skills/review"] }).pipe(Effect.flip),
          );
          expect(error.code).toBe("validation");
          expect(error.detail).toContain(scenario.message);
          if (scenario.extra !== undefined)
            expect(error.suggestions).toContainEqual({
              description: "Remove the unsafe entry from the extension directory.",
            });
          expect(context.registry.storedFiles()).toEqual([]);
        }),
      ),
    );
  }
});

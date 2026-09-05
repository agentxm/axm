import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  archiveContents,
  makePublicationSpecContext,
} from "../../support/publication-evidence-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/ignore-patterns-have-declared-path-semantics",
  title: "Publication exclusions use explicit case-sensitive package paths",
  statement:
    "Publish shall match ignore patterns against case-sensitive archive-relative POSIX paths with only the asterisk acting as a wildcard across directory separators and with question marks, brackets, and negation characters treated literally.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["decision-table", "example"],
  derivedFrom: ["packages/cli/help/topics/publish.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication ignore matching", () => {
  it.effect(
    "matches the actual nested and literal paths without shell-glob or negation behavior",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: { skills: { review: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, {
            name: "review",
            publishIgnore: ["evals/*", "literal?.txt", "[ab].txt", "!keep.txt", "case/*"],
          });
          const packageRoot = path.join(context.workspace.root, "skills", "review");
          const excluded = ["evals/deep/case.json", "literal?.txt", "[ab].txt", "!keep.txt"];
          const retained = ["CASE/Keep.md", "literalx.txt", "a.txt", "keep.txt"];
          for (const file of [...excluded, ...retained]) {
            const absolute = path.join(packageRoot, file);
            fs.mkdirSync(path.dirname(absolute), { recursive: true });
            fs.writeFileSync(absolute, `Content for ${file}\n`);
          }
          yield* context.run();
          const contents = yield* archiveContents(context.archive("review"));
          expect(Object.keys(contents).sort()).toEqual(
            [...retained, "skill.json", "src/SKILL.md"].sort(),
          );
          const result = yield* context.result();
          const archive = result.execution.outcomes[0]?.archive;
          expect(archive?.excluded.map(({ path }) => path).sort()).toEqual(excluded.sort());
          expect(archive?.patterns).toEqual([
            { pattern: "evals/*", matchCount: 1 },
            { pattern: "literal?.txt", matchCount: 1 },
            { pattern: "[ab].txt", matchCount: 1 },
            { pattern: "!keep.txt", matchCount: 1 },
            { pattern: "case/*", matchCount: 0 },
          ]);
        }),
      ),
  );
});

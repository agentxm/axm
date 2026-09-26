import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { planZipArchive } from "../archive.js";
import { publishArchiveOptions } from "../publish-ignore.js";
import { archiveContents } from "../test-helpers.js";
import { writeAuthoredExtension } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/publish/ignore-patterns-have-declared-path-semantics",
  title: "Publication exclusions use explicit case-sensitive package paths",
  statement:
    "Publish shall match ignore patterns against case-sensitive archive-relative POSIX paths with only the asterisk acting as a wildcard across directory separators and with question marks, brackets, and negation characters treated literally.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["decision-table", "example"],
  derivedFrom: ["apps/cli/help/topics/publish.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication ignore matching", () => {
  it.effect(
    "matches the actual nested and literal paths without shell-glob or negation behavior",
    () =>
      Effect.gen(function* () {
        const workspaceRoot = fs.realpathSync(
          fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-publish-ignore-")),
        );
        try {
          const ignore = ["evals/*", "literal?.txt", "[ab].txt", "!keep.txt", "case/*"];
          const packageRoot = writeAuthoredExtension(workspaceRoot, "skill", {
            name: "review",
            publishIgnore: ignore,
          });
          const excluded = ["evals/deep/case.json", "literal?.txt", "[ab].txt", "!keep.txt"];
          const retained = ["CASE/Keep.md", "literalx.txt", "a.txt", "keep.txt"];
          for (const file of [...excluded, ...retained]) {
            const absolute = nodePath.join(packageRoot, file);
            fs.mkdirSync(nodePath.dirname(absolute), { recursive: true });
            fs.writeFileSync(absolute, `Content for ${file}\n`);
          }

          const options = yield* publishArchiveOptions("skill", ignore);
          const planned = yield* planZipArchive(packageRoot, options);

          const contents = yield* archiveContents(planned.archive);
          expect(Object.keys(contents).sort()).toEqual(
            [...retained, "skill.json", "src/SKILL.md"].sort(),
          );
          expect(planned.plan.excluded.map(({ path }) => path).sort()).toEqual(excluded.sort());
          expect(planned.plan.patterns).toEqual([
            { pattern: "evals/*", matchCount: 1 },
            { pattern: "literal?.txt", matchCount: 1 },
            { pattern: "[ab].txt", matchCount: 1 },
            { pattern: "!keep.txt", matchCount: 1 },
            { pattern: "case/*", matchCount: 0 },
          ]);
        } finally {
          fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

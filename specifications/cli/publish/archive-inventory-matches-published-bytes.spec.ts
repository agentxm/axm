import * as crypto from "node:crypto";
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
  requirement: "cli/publish/archive-inventory-matches-published-bytes",
  title: "The publication archive matches its complete reported inventory",
  statement:
    "Publish shall include every regular package-root file unless explicitly ignored and report the effective included and excluded paths, byte sizes, matching patterns, pattern counts and warnings, total source and ZIP bytes, and SRI SHA-512 integrity that describe the archive it publishes.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "machine-automation"],
  methods: ["example", "contract"],
  derivedFrom: [
    "packages/cli/help/topics/publish.md",
    "packages/cli/src/root/publish/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Published archive inventory", () => {
  for (const ignore of [undefined, [], ["evals/*", "missing-*"]]) {
    it.effect(
      `reports and publishes the actual package-root content with ${JSON.stringify(ignore)} exclusions`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* makePublicationSpecContext({
              settings: { skills: { review: "workspace" } },
            });
            writeAuthoredSkill(context.workspace.root, {
              name: "review",
              ...(ignore === undefined ? {} : { publishIgnore: ignore }),
            });
            const packageRoot = path.join(context.workspace.root, "skills", "review");
            fs.mkdirSync(path.join(packageRoot, "evals"), { recursive: true });
            fs.writeFileSync(path.join(packageRoot, "README.md"), "Authored package notes.\n");
            fs.writeFileSync(path.join(packageRoot, "evals", "case.json"), "{}\n");
            yield* context.run({ preview: true });
            const preview = yield* context.result();
            const planned = preview.execution.outcomes.find(
              (item) => item.id === "@acme/skills/review",
            )?.archive;
            expect(planned).toBeDefined();
            if (planned === undefined) throw new Error("Expected the effective archive inventory");
            yield* context.run();
            const actual = context.archive("review");
            const contents = yield* archiveContents(actual);
            const excluded = ignore !== undefined && ignore.length > 0 ? ["evals/case.json"] : [];
            const included = ["README.md", "evals/case.json", "skill.json", "src/SKILL.md"].filter(
              (file) => !excluded.includes(file),
            );
            expect(Object.keys(contents).sort()).toEqual(included);
            expect(planned.included).toEqual(
              included.map((file) => ({
                path: file,
                size: fs.statSync(path.join(packageRoot, file)).size,
                matchedPatterns: [],
              })),
            );
            expect(planned.excluded).toEqual(
              excluded.map((file) => ({ path: file, size: 3, matchedPatterns: ["evals/*"] })),
            );
            expect(planned.includedCount).toBe(included.length);
            expect(planned.excludedCount).toBe(excluded.length);
            expect(planned.uncompressedBytes).toBe(
              Object.values(contents).reduce((sum, content) => sum + content.length, 0),
            );
            expect(planned.zipBytes).toBe(actual.length);
            expect(planned.integrity).toBe(
              `sha512-${crypto.createHash("sha512").update(actual).digest("base64")}`,
            );
            expect(planned.patterns).toEqual(
              excluded.length === 0
                ? []
                : [
                    { pattern: "evals/*", matchCount: 1 },
                    { pattern: "missing-*", matchCount: 0 },
                  ],
            );
            expect(planned.warnings).toEqual(
              excluded.length === 0
                ? expect.any(Array)
                : ['publish.ignore pattern "missing-*" matched no files.'],
            );
            for (const [file, bytes] of Object.entries(contents))
              expect(bytes).toEqual(fs.readFileSync(path.join(packageRoot, file)));
          }),
        ),
    );
  }
  it.effect("preserves extension manifest metadata in the actual uploaded archive", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* makePublicationSpecContext({
          settings: { skills: { review: "workspace" } },
        });
        writeAuthoredSkill(context.workspace.root, { name: "review" });
        const manifest = {
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
          metadata: { "com.example/tool": { enabled: true, values: ["one", "two"] } },
        };
        const bytes = Buffer.from(JSON.stringify(manifest));
        fs.writeFileSync(
          path.join(context.workspace.root, "skills", "review", "skill.json"),
          bytes,
        );
        yield* context.run();
        const contents = yield* archiveContents(context.archive("review"));
        expect(contents["skill.json"]).toEqual(bytes);
        expect((yield* context.result()).counts.published).toBe(1);
      }),
    ),
  );
});

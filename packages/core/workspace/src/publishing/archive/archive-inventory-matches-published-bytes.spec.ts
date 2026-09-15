import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  archiveContents,
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/archive-inventory-matches-published-bytes",
  title: "The publication archive matches its complete reported inventory",
  statement:
    "Publish shall include every regular package-root file unless explicitly ignored and report the effective included and excluded paths, byte sizes, matching patterns, pattern counts and warnings, total source and ZIP bytes, and SRI SHA-512 integrity that describe the archive it publishes.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "machine-automation"],
  methods: ["example", "contract"],
  derivedFrom: ["apps/cli/help/topics/publish.md", "apps/cli/src/root/publish/command.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * `evals/` in the package root with no declared decision is the one case that
 * earns a distribution-boundary warning, so each row states the exact warning
 * list its declaration produces rather than accepting any array.
 */
const developmentRootWarning =
  "Review the Registry distribution boundary: evals/ is included and publish.ignore has no explicit decision. Shipping these files may be intentional; AXM never excludes them automatically.";

describe("Published archive inventory", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const authoredWorld = (publishIgnore?: ReadonlyArray<string>) => {
    const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
    worlds.push(world);
    const packageRoot = world.write("skill", {
      name: "review",
      ...(publishIgnore === undefined ? {} : { publishIgnore }),
    });
    return { world, packageRoot };
  };

  for (const ignore of [undefined, [], ["evals/*", "missing-*"]]) {
    it.effect(
      `reports and publishes the actual package-root content with ${JSON.stringify(ignore)} exclusions`,
      () =>
        Effect.gen(function* () {
          const { world, packageRoot } = authoredWorld(ignore);
          fs.mkdirSync(nodePath.join(packageRoot, "evals"), { recursive: true });
          fs.writeFileSync(nodePath.join(packageRoot, "README.md"), "Authored package notes.\n");
          fs.writeFileSync(nodePath.join(packageRoot, "evals", "case.json"), "{}\n");

          const previewed = yield* world.provide(runPublish(requestFor(world, { preview: true })));
          const planned = publishDocument(previewed).execution.outcomes.find(
            (item) => item.id === "@acme/skills/review",
          )?.archive;
          expect(planned).toBeDefined();
          if (planned === undefined) throw new Error("Expected the effective archive inventory");

          const applied = yield* world.provide(runPublish(requestFor(world, { preview: false })));
          expect(publishDocument(applied).counts.published).toBe(1);
          const actual = world.archive("review");
          const contents = yield* archiveContents(actual);
          const excluded = ignore !== undefined && ignore.length > 0 ? ["evals/case.json"] : [];
          const included = ["README.md", "evals/case.json", "skill.json", "src/SKILL.md"].filter(
            (file) => !excluded.includes(file),
          );
          expect(Object.keys(contents).sort()).toEqual(included);
          expect(planned.included).toEqual(
            included.map((file) => ({
              path: file,
              size: fs.statSync(nodePath.join(packageRoot, file)).size,
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
            ignore === undefined
              ? [developmentRootWarning]
              : ignore.length === 0
                ? []
                : ['publish.ignore pattern "missing-*" matched no files.'],
          );
          for (const [file, bytes] of Object.entries(contents))
            expect(bytes).toEqual(fs.readFileSync(nodePath.join(packageRoot, file)));
        }),
    );
  }

  it.effect("preserves extension manifest metadata in the actual uploaded archive", () =>
    Effect.gen(function* () {
      const { world, packageRoot } = authoredWorld();
      const manifest = {
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
        description: "The review skill.",
        metadata: { "com.example/tool": { enabled: true, values: ["one", "two"] } },
      };
      const bytes = Buffer.from(JSON.stringify(manifest));
      fs.writeFileSync(nodePath.join(packageRoot, "skill.json"), bytes);

      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

      const contents = yield* archiveContents(world.archive("review"));
      expect(contents["skill.json"]).toEqual(bytes);
      expect(publishDocument(outcome).counts.published).toBe(1);
    }),
  );
});

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import { parseZipCentralDirectory } from "@agentxm/extension-content";
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
    "Publish shall include every regular package-root file, executable mode, empty directory, and contained relative link (including cycles) as selected by the resolved Git-ignore or explicit include/exclude policy and report the effective included and excluded paths, byte sizes, matching patterns, pattern counts and warnings, total source and ZIP bytes, and SRI SHA-512 integrity that describe the archive it publishes.",
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
  "Review the Registry distribution boundary: evals/ is included and publish.exclude has no explicit decision. Shipping these files may be intentional; AXM never excludes them automatically.";

describe("Published archive inventory", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const authoredWorld = (publishExclude?: ReadonlyArray<string>) => {
    const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
    worlds.push(world);
    const packageRoot = world.write("skill", {
      name: "review",
      ...(publishExclude === undefined ? {} : { publishExclude }),
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
              sourcePath: file,
              ...(file === "skill.json"
                ? { ruleOrigin: { kind: "builtin", rule: "required-manifest" } }
                : {}),
              size: fs.statSync(nodePath.join(packageRoot, file)).size,
              matchedPatterns: [],
            })),
          );
          expect(planned.excluded).toEqual(
            excluded.map((file) => ({
              path: file,
              sourcePath: file,
              size: 3,
              matchedPatterns: ["evals/*"],
              ruleOrigin: { kind: "manifest", field: "exclude", index: 0 },
            })),
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
                  {
                    pattern: "evals/*",
                    matchCount: 1,
                    origin: { kind: "manifest", field: "exclude", index: 0 },
                  },
                  {
                    pattern: "missing-*",
                    matchCount: 0,
                    origin: { kind: "manifest", field: "exclude", index: 1 },
                  },
                ],
          );
          expect(planned.warnings).toEqual(
            ignore === undefined
              ? [developmentRootWarning]
              : ignore.length === 0
                ? []
                : ['publish.exclude pattern "missing-*" matched no files.'],
          );
          for (const [file, bytes] of Object.entries(contents))
            expect(bytes).toEqual(fs.readFileSync(nodePath.join(packageRoot, file)));
        }),
    );
  }

  it.effect("publishes the full payload without dereferencing its links", () =>
    Effect.gen(function* () {
      const { world, packageRoot } = authoredWorld();
      fs.writeFileSync(nodePath.join(packageRoot, "src", "run.sh"), "#!/bin/sh\necho ok\n");
      fs.chmodSync(nodePath.join(packageRoot, "src", "run.sh"), 0o755);
      fs.mkdirSync(nodePath.join(packageRoot, "src", "empty"));
      fs.symlinkSync("run.sh", nodePath.join(packageRoot, "src", "run"));
      fs.symlinkSync("b", nodePath.join(packageRoot, "src", "a"));
      fs.symlinkSync("a", nodePath.join(packageRoot, "src", "b"));
      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));
      expect(publishDocument(outcome).counts.published).toBe(1);
      const actual = world.archive("review");
      const contents = yield* archiveContents(actual);
      const entries = yield* parseZipCentralDirectory(actual);
      expect(contents["src/run"]).toEqual(Buffer.from("run.sh"));
      expect(contents["src/a"]).toEqual(Buffer.from("b"));
      expect(contents["src/b"]).toEqual(Buffer.from("a"));
      expect(contents["src/empty/"]).toEqual(Buffer.alloc(0));
      expect(
        (entries.find(({ fileName }) => fileName === "src/run.sh")?.externalAttributes ?? 0) >>> 16,
      ).toBe(0o100755);
      expect(
        (entries.find(({ fileName }) => fileName === "src/run")?.externalAttributes ?? 0) >>> 16,
      ).toBe(0o120777);
    }),
  );

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

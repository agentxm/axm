import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import { PublishExtensions } from "./index.js";
import { applyPlanExecution } from "@agentxm/workspace-kernel/operations";
import { parseZipCentralDirectory } from "@agentxm/extension-content";
import {
  archiveContents,
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/existing-directory-uses-a-separate-envelope",
  title: "Explicit publication preserves an existing skill directory under a publisher envelope",
  statement:
    "When a creator explicitly supplies an existing skill directory, a fully qualified skill identity, and an exact package version, AXM shall publish the selected unchanged payload under a separate identity/version envelope without requiring an upstream AXM manifest, rewriting metadata, or claiming workspace authorship. Preview shall upload nothing; ordinary configured publication shall retain its authorship policy. The existing authorization, immutable-version, source-state, freshness, and settlement rules shall govern the publication, with source comparisons referring to original payload paths rather than generated envelope paths.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "trustworthy-distribution", "workspace-intent-fidelity"],
  methods: ["example", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Existing-directory publication", () => {
  const worlds: PublishWorld[] = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });
  const existing = (body: string) => {
    const observed: Array<{
      readonly directory: string;
      readonly currentPaths: ReadonlyArray<string>;
    }> = [];
    const world = makePublishWorld({
      compare: (input) => {
        observed.push(input);
        return Effect.succeed(
          Option.some({
            repositoryRoot: input.directory,
            repositoryDirectory: ".",
            headRevision: "0123456789abcdef0123456789abcdef01234567",
            differences: [],
          }),
        );
      },
    });
    worlds.push(world);
    const directory = path.join(world.root, "upstream");
    fs.mkdirSync(path.join(directory, "_assets"), { recursive: true });
    fs.mkdirSync(path.join(directory, "empty"));
    fs.writeFileSync(path.join(directory, "SKILL.md"), body);
    fs.writeFileSync(path.join(directory, "metadata.json"), '{"upstream":true}\r\n');
    fs.writeFileSync(path.join(directory, "_assets", "run.sh"), "#!/bin/sh\necho ok\n");
    fs.chmodSync(path.join(directory, "_assets", "run.sh"), 0o755);
    fs.symlinkSync("_assets/run.sh", path.join(directory, "run"));
    return { world, directory, observed };
  };

  for (const body of [
    "---\r\nname: Upstream Display Name\r\nvendor: {enabled: true}\r\n---\r\n# Review\r\n",
    "# A skill without descriptive metadata\n",
    "---\nname: [unfinished\n---\n# Existing body\n",
  ]) {
    it.effect(
      `preserves ${body.includes("unfinished") ? "malformed descriptive metadata" : body.startsWith("#") ? "an unadorned body" : "vendor metadata and display identity"}`,
      () =>
        Effect.gen(function* () {
          const { world, directory, observed } = existing(body);
          const before = JSON.stringify(world.readSettings());
          const intent = {
            selectors: ["@acme/skills/review"],
            from: directory,
            packageVersion: "1.0.0",
          };
          const preview = yield* world.provide(
            runPublish(requestFor(world, { ...intent, preview: true })),
          );
          expect(publishDocument(preview).counts.published).toBe(0);
          expect(world.target.storedFiles()).toEqual([]);
          const applied = yield* world.provide(
            runPublish(requestFor(world, { ...intent, preview: false })),
          );
          const document = publishDocument(applied);
          expect(document.counts.published).toBe(1);
          expect(document.execution.outcomes[0]).toMatchObject({
            authored: false,
            sourceType: "local",
            version: "1.0.0",
          });
          const archive = world.archive("review");
          const contents = yield* archiveContents(archive);
          expect(contents["src/SKILL.md"]).toEqual(Buffer.from(body));
          expect(contents["src/metadata.json"]).toEqual(Buffer.from('{"upstream":true}\r\n'));
          expect(contents["src/run"]).toEqual(Buffer.from("_assets/run.sh"));
          expect(contents["src/empty/"]).toEqual(Buffer.alloc(0));
          const envelope: unknown = JSON.parse(new TextDecoder().decode(contents["skill.json"]));
          expect(envelope).toMatchObject({
            owner: "@acme",
            type: "skill",
            name: "review",
            version: "1.0.0",
          });
          const entries = yield* parseZipCentralDirectory(archive);
          expect(
            (entries.find(({ fileName }) => fileName === "src/_assets/run.sh")
              ?.externalAttributes ?? 0) >>> 16,
          ).toBe(0o100755);
          expect(fs.readFileSync(path.join(directory, "SKILL.md"), "utf8")).toBe(body);
          expect(fs.existsSync(path.join(directory, "skill.json"))).toBe(false);
          expect(fs.existsSync(path.join(directory, "axm.json"))).toBe(false);
          expect(world.protectedWrites(["upstream"])).toEqual([]);
          expect(JSON.stringify(world.readSettings())).toBe(before);
          expect(observed.length).toBeGreaterThanOrEqual(3);
          for (const input of observed) {
            expect(input.directory).toBe(directory);
            expect(input.currentPaths).toEqual(
              ["_assets/run.sh", "empty/", "metadata.json", "run", "SKILL.md"].sort((a, b) =>
                a.localeCompare(b),
              ),
            );
          }
          const registryBefore = world.snapshotRegistry();
          fs.writeFileSync(path.join(directory, "SKILL.md"), "A later local edit\n");
          const repeated = yield* world.provide(
            runPublish(requestFor(world, { ...intent, preview: false })),
          );
          expect(publishDocument(repeated).counts.published).toBe(0);
          expect(world.snapshotRegistry()).toEqual(registryBefore);
        }),
    );
  }

  for (const change of ["bytes", "mode", "link", "addition"] as const) {
    it.effect(`refuses ${change} changes between preparation and upload`, () =>
      Effect.gen(function* () {
        const { world, directory } = existing("# Skill\n");
        yield* world.provide(
          Effect.gen(function* () {
            const preparation = yield* PublishExtensions.prepare(
              requestFor(world, {
                selectors: ["@acme/skills/review"],
                from: directory,
                packageVersion: "1.0.0",
                preview: false,
              }),
            );
            if (preparation._tag !== "Ready") throw new Error("Expected a prepared publication");
            if (change === "bytes")
              fs.writeFileSync(path.join(directory, "SKILL.md"), "Changed body\n");
            if (change === "mode") fs.chmodSync(path.join(directory, "_assets", "run.sh"), 0o644);
            if (change === "link") {
              fs.unlinkSync(path.join(directory, "run"));
              fs.symlinkSync("SKILL.md", path.join(directory, "run"));
            }
            if (change === "addition")
              fs.writeFileSync(path.join(directory, "later.txt"), "Added\n");
            const outcome = yield* PublishExtensions.previewOrApply(
              preparation.candidate,
              applyPlanExecution({
                approval: "preapproved",
                acceptedPolicies: new Set(),
                recovery: { command: [], arguments: [] },
              }),
            );
            expect(outcome.disposition._tag).toBe("Failed");
            expect(world.target.storedFiles()).toEqual([]);
          }),
        );
      }),
    );
  }

  it.effect("keeps the generated manifest while excluding an upstream manifest", () =>
    Effect.gen(function* () {
      const { world, directory } = existing("# Skill\n");
      fs.writeFileSync(path.join(directory, "skill.json"), '{"upstream":true}');
      const result = yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review"],
            from: directory,
            packageVersion: "1.0.0",
            preview: false,
            fileInclude: ["**"],
            fileExclude: ["/skill.json"],
          }),
        ),
      );
      expect(publishDocument(result).counts.published).toBe(1);
      const contents = yield* archiveContents(world.archive("review"));
      expect(contents["skill.json"]).toBeDefined();
      expect(contents["src/skill.json"]).toBeUndefined();
      expect(fs.readFileSync(path.join(directory, "skill.json"), "utf8")).toBe('{"upstream":true}');
    }),
  );

  for (const explicit of [false, true]) {
    it.effect(
      `selects original paths before creating the envelope (${explicit ? "explicit" : "inherited"})`,
      () =>
        Effect.gen(function* () {
          const { world, directory } = existing("# Skill\n");
          fs.mkdirSync(path.join(directory, ".git"));
          fs.writeFileSync(path.join(directory, ".gitignore"), "/metadata.json\n");
          const result = yield* world.provide(
            runPublish(
              requestFor(world, {
                selectors: ["@acme/skills/review"],
                from: directory,
                packageVersion: "1.0.0",
                preview: false,
                ...(explicit
                  ? { fileInclude: ["**"], fileExclude: ["/metadata.json", "/.gitignore"] }
                  : {}),
              }),
            ),
          );
          expect(publishDocument(result).counts.published).toBe(1);
          const contents = yield* archiveContents(world.archive("review"));
          expect(contents["src/metadata.json"]).toBeUndefined();
          expect(contents["src/SKILL.md"]).toEqual(Buffer.from("# Skill\n"));
          const excluded = publishDocument(result).execution.outcomes[0]?.archive?.excluded;
          expect(excluded).toContainEqual(
            expect.objectContaining({
              path: "src/metadata.json",
              sourcePath: "metadata.json",
              ruleOrigin: explicit
                ? { kind: "manifest", field: "exclude", index: 0 }
                : { kind: "gitignore", file: ".gitignore", line: 1 },
            }),
          );
          const envelope: unknown = JSON.parse(new TextDecoder().decode(contents["skill.json"]));
          if (explicit)
            expect(envelope).toMatchObject({
              publish: {
                include: ["/src/**/**"],
                exclude: ["/src/metadata.json", "/src/.gitignore"],
              },
            });
          expect(fs.readFileSync(path.join(directory, "metadata.json"), "utf8")).toBe(
            '{"upstream":true}\r\n',
          );
        }),
    );
  }

  it.effect("excludes and reports Git administration without changing it", () =>
    Effect.gen(function* () {
      const { world, directory } = existing("# Skill\n");
      fs.mkdirSync(path.join(directory, ".git"));
      fs.writeFileSync(path.join(directory, ".git", "config"), "fixture configuration\n");
      const result = yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review"],
            from: directory,
            packageVersion: "1.0.0",
            preview: false,
          }),
        ),
      );
      expect(publishDocument(result).counts.published).toBe(1);
      const contents = yield* archiveContents(world.archive("review"));
      expect(contents["src/.git/config"]).toBeUndefined();
      expect(publishDocument(result).execution.outcomes[0]?.archive?.excluded).toContainEqual({
        path: "src/.git/",
        sourcePath: ".git",
        size: 0,
        matchedPatterns: [".git"],
        ruleOrigin: { kind: "builtin", rule: "git-administration" },
      });
      expect(fs.readFileSync(path.join(directory, ".git", "config"), "utf8")).toBe(
        "fixture configuration\n",
      );
    }),
  );
});

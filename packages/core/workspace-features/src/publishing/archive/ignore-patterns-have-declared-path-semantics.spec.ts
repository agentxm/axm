import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { planZipArchive } from "../index.js";
import { archiveContents } from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/ignore-patterns-have-declared-path-semantics",
  title: "Publication selects files with Git patterns and explicit ordered overrides",
  statement:
    "Publish shall apply case-sensitive repository-root, ancestor, and nested .gitignore patterns to all package paths by default, use an explicit ordered include allowlist instead when supplied, apply ordered Git-style exclude rules afterward, automatically retain the type manifest unless explicitly excluded, and always omit Git administration data.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Real inherited .gitignore files establish source-root coordinates and directory kinds.",
  methods: ["decision-table", "example"],
  derivedFrom: ["apps/cli/help/topics/publish.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication file selection", () => {
  for (const row of [
    {
      name: "default Git selection",
      include: undefined,
      exclude: [],
      retained: [".hidden", "src/SKILL.md", "src/keep.log"],
      omitted: ["dist/build.js", "config.json", "src/other.log"],
    },
    {
      name: "explicit generated content",
      include: ["/src/", "/dist/"],
      exclude: ["*.log"],
      retained: ["src/SKILL.md", "dist/build.js"],
      omitted: [".hidden", "config.json", "src/keep.log", "src/other.log"],
    },
    {
      name: "publish all",
      include: ["**"],
      exclude: [],
      retained: [
        ".hidden",
        "src/SKILL.md",
        "dist/build.js",
        "config.json",
        "src/keep.log",
        "src/other.log",
      ],
      omitted: [],
    },
    {
      name: "empty allowlist",
      include: [],
      exclude: [],
      retained: [],
      omitted: [
        ".hidden",
        "src/SKILL.md",
        "dist/build.js",
        "config.json",
        "src/keep.log",
        "src/other.log",
      ],
    },
    {
      name: "ordered exceptions",
      include: ["**", "!*.log"],
      exclude: ["**/*.json", "!config.json", "!skill.json"],
      retained: [".hidden", "src/SKILL.md", "dist/build.js", "config.json"],
      omitted: ["src/keep.log", "src/other.log"],
    },
  ]) {
    it.effect(row.name, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const packageRoot = path.join(root, "skills", "review");
        yield* fs.makeDirectory(path.join(root, ".git"));
        yield* fs.makeDirectory(path.join(packageRoot, "src"), { recursive: true });
        yield* fs.makeDirectory(path.join(packageRoot, "dist"));
        yield* fs.writeFileString(path.join(root, ".gitignore"), "*.log\n");
        yield* fs.writeFileString(path.join(root, "skills", ".gitignore"), "dist/\n**/*.json\n");
        yield* fs.writeFileString(path.join(packageRoot, "src", ".gitignore"), "!keep.log\n");
        for (const file of [
          ".hidden",
          "skill.json",
          "src/SKILL.md",
          "dist/build.js",
          "config.json",
          "src/keep.log",
          "src/other.log",
        ])
          yield* fs.writeFileString(path.join(packageRoot, file), "package content");
        yield* fs.writeFileString(
          path.join(packageRoot, "src", ".git"),
          "gitdir: ../administration",
        );
        const planned = yield* planZipArchive(packageRoot, {
          ...(row.include === undefined ? {} : { include: row.include }),
          exclude: row.exclude,
          manifest: "skill.json",
        });
        const contents = yield* archiveContents(planned.archive);
        expect(contents["skill.json"]).toBeDefined();
        expect(contents["src/.git"]).toBeUndefined();
        for (const file of row.retained) expect(contents[file], file).toBeDefined();
        for (const file of row.omitted) expect(contents[file], file).toBeUndefined();
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("refuses explicit manifest removal but accepts a final restoring exception", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "skill.json"), "{}");
      const refused = yield* planZipArchive(root, { exclude: ["**/*.json"] }).pipe(Effect.result);
      expect(refused._tag).toBe("Failure");
      const restored = yield* planZipArchive(root, { exclude: ["**/*.json", "!skill.json"] });
      expect(restored.plan.included.map(({ path }) => path)).toEqual(["skill.json"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

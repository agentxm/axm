/**
 * Reading a plugin's skill distribution resolves each skill directory's real
 * path once, through the containment check that also deduplicates the Codex
 * walk, and still resolves the plugin root, its manifest and every SKILL.md.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { readPluginDistribution } from "./plugin-distribution.js";

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const skill = (name: string) => `---\nname: ${name}\ndescription: The ${name} skill\n---\n`;

/** Read the distribution under a recording filesystem whose recording starts after setup. */
const read = (root: string) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const distribution = yield* readPluginDistribution(root);
    const resolutions = (target: string) =>
      recording.calls({ method: "realPath", path: target }).length;
    return { distribution, resolutions };
  }).pipe(
    Effect.provide(Layer.mergeAll(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer)),
  );

describe("readPluginDistribution work", () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-plugin-distribution-")));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("resolves each visited Codex skill directory once", () =>
    Effect.gen(function* () {
      write(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "kit" }));
      write(path.join(root, "skills", "a", "SKILL.md"), skill("a"));
      write(path.join(root, "skills", "b", "SKILL.md"), skill("b"));
      const skills = path.join(root, "skills");

      const { distribution, resolutions } = yield* read(root);

      expect({
        root: resolutions(root),
        agentPluginsManifest: resolutions(path.join(root, "plugin.json")),
        manifest: resolutions(path.join(root, ".codex-plugin", "plugin.json")),
        skills: resolutions(skills),
        a: resolutions(path.join(skills, "a")),
        b: resolutions(path.join(skills, "b")),
        aSkill: resolutions(path.join(skills, "a", "SKILL.md")),
        bSkill: resolutions(path.join(skills, "b", "SKILL.md")),
      }).toStrictEqual({
        root: 1,
        agentPluginsManifest: 0,
        manifest: 1,
        skills: 1,
        a: 1,
        b: 1,
        aSkill: 1,
        bSkill: 1,
      });
      expect(distribution).toStrictEqual(
        Option.some({
          format: "codex",
          manifestPath: ".codex-plugin/plugin.json",
          skills: [path.join(skills, "a"), path.join(skills, "b")],
          resolvedRoot: root,
        }),
      );
    }),
  );

  it.effect("still resolves a Cursor skills root once before probing its skills", () =>
    Effect.gen(function* () {
      write(path.join(root, ".cursor-plugin", "plugin.json"), JSON.stringify({ name: "kit" }));
      write(path.join(root, "skills", "x", "SKILL.md"), skill("x"));
      const skills = path.join(root, "skills");

      const { distribution, resolutions } = yield* read(root);

      expect({
        root: resolutions(root),
        skills: resolutions(skills),
        xSkill: resolutions(path.join(skills, "x", "SKILL.md")),
      }).toStrictEqual({ root: 1, skills: 1, xSkill: 1 });
      expect(distribution).toStrictEqual(
        Option.some({
          format: "cursor",
          manifestPath: ".cursor-plugin/plugin.json",
          skills: [path.join(skills, "x")],
          resolvedRoot: root,
        }),
      );
    }),
  );
});

describe("readPluginDistribution Codex skill walk containment", () => {
  let base: string;
  let root: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-plugin-distribution-")));
    root = path.join(base, "plugin");
    write(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "kit" }));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const distribution = (directory: string) =>
    readPluginDistribution(directory).pipe(
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    );

  it.effect("refuses a skill directory linked outside the plugin", () =>
    Effect.gen(function* () {
      write(path.join(base, "outside", "SKILL.md"), skill("outside"));
      fs.mkdirSync(path.join(root, "skills"), { recursive: true });
      fs.symlinkSync(path.join(base, "outside"), path.join(root, "skills", "linked"), "dir");

      const failure = yield* Effect.flip(distribution(root));

      expect({ tag: failure._tag, detail: failure.detail }).toStrictEqual({
        tag: "SourceNotResolvable",
        detail: `Plugin path escapes its package: ${path.join(root, "skills", "linked")}`,
      });
    }),
  );

  it.effect("returns each physical skill directory once across an in-package cycle", () =>
    Effect.gen(function* () {
      write(path.join(root, "skills", "a", "SKILL.md"), skill("a"));
      fs.mkdirSync(path.join(root, "skills", "group"), { recursive: true });
      fs.symlinkSync("..", path.join(root, "skills", "group", "back"), "dir");

      const result = yield* distribution(root);

      expect(result).toStrictEqual(
        Option.some({
          format: "codex",
          manifestPath: ".codex-plugin/plugin.json",
          skills: [path.join(root, "skills", "a")],
          resolvedRoot: root,
        }),
      );
    }),
  );
});

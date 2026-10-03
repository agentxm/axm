import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { discoverExtensionPackages } from "./index.js";

export const specification = defineSpecification({
  requirement: "skills/acquisition/plugin-skills-respect-package-layout",
  title: "Plugin skill discovery retains package context and declared layout",
  statement:
    "When discovering skills from a supported plugin manifest, AXM shall retain the package root and selected component paths, discover Agent Plugins 1.0 skills only from immediate children of skills, augment Claude's default skill directory with declared paths, apply Cursor's replacement paths and Codex's recursive explicit-root discovery separately from Claude's defaults, validate Agent Plugins core manifest fields by their declared JSON types and name constraints without imposing semantic-version or URL formats on descriptive metadata, and refuse declared skill paths that escape the package.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Real files and symlinks establish manifest interpretation and physical containment through public discovery.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const filter = { names: [], owner: Option.none(), type: "skill" } as const;
const write = (root: string, relative: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join(root, relative);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, content);
  });

describe("Plugin skill layouts", () => {
  it.effect("retains the portable package while selecting immediate skill children", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-portable-plugin-" });
      yield* write(
        root,
        "plugin.json",
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "reviews",
          skills: 42,
        }),
      );
      yield* write(root, "mcp.json", '{"mcpServers":{}}');
      for (const relative of [
        "skills/SKILL.md",
        "skills/review/SKILL.md",
        "skills/group/nested/SKILL.md",
      ])
        yield* write(root, relative, `# ${relative}\n`);
      const found = yield* discoverExtensionPackages(root, filter);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        kind: "portable-skill",
        sourcePath: "skills/review",
        distribution: {
          format: "agent-plugins",
          packageRoot: ".",
          componentPath: "skills/review",
          manifestPath: "plugin.json",
        },
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("includes both default and declared Claude skill paths", () =>
    Effect.gen(function* () {
      const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
        prefix: "axm-claude-plugin-",
      });
      yield* write(root, ".claude-plugin/plugin.json", '{"name":"reviews","skills":["./extra"]}');
      yield* write(root, "skills/default/SKILL.md", "# Default\n");
      yield* write(root, "extra/SKILL.md", "# Additional\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(
        found.map((item) => (item.kind === "portable-skill" ? item.sourcePath : "manifest")),
      ).toEqual(["extra", "skills/default"]);
      for (const candidate of found)
        expect(candidate).toMatchObject({
          distribution: {
            format: "claude",
            packageRoot: ".",
            manifestPath: ".claude-plugin/plugin.json",
          },
        });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each(["string", "array"] as const)(
    "Cursor %s paths replace default discovery",
    (shape) =>
      Effect.gen(function* () {
        const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
          prefix: "axm-cursor-plugin-",
        });
        yield* write(
          root,
          ".cursor-plugin/plugin.json",
          JSON.stringify({
            name: "reviews",
            skills: shape === "string" ? "./extra" : ["./extra"],
            future: { quiet: true },
          }),
        );
        yield* write(root, "skills/default/SKILL.md", "# Default\n");
        yield* write(root, "extra/SKILL.md", "# Selected\n");
        const found = yield* discoverExtensionPackages(root, filter);
        expect(
          found.map((item) => (item.kind === "portable-skill" ? item.sourcePath : "manifest")),
        ).toEqual(["extra"]);
        expect(found[0]).toMatchObject({
          distribution: { format: "cursor", packageRoot: ".", componentPath: "extra" },
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("Codex explicit roots replace defaults and recursively stop at skill payloads", () =>
    Effect.gen(function* () {
      const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
        prefix: "axm-codex-plugin-",
      });
      yield* write(
        root,
        ".codex-plugin/plugin.json",
        JSON.stringify({ name: "reviews", skills: "./extra" }),
      );
      yield* write(root, "skills/default/SKILL.md", "# Default\n");
      yield* write(root, "extra/group/review/SKILL.md", "# Selected\n");
      yield* write(root, "extra/group/review/examples/nested/SKILL.md", "# Payload only\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(
        found.map((item) => (item.kind === "portable-skill" ? item.sourcePath : "manifest")),
      ).toEqual(["extra/group/review"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("Codex empty skill paths retain conventional discovery", () =>
    Effect.gen(function* () {
      const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
        prefix: "axm-codex-plugin-",
      });
      yield* write(
        root,
        ".codex-plugin/plugin.json",
        JSON.stringify({ name: "reviews", skills: [] }),
      );
      yield* write(root, "skills/default/SKILL.md", "# Default\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(
        found.map((item) => (item.kind === "portable-skill" ? item.sourcePath : "manifest")),
      ).toEqual(["skills/default"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each(["lexical", "symlink"])("refuses %s escape through a declared path", (kind) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-plugin-containment-" });
      const plugin = path.join(root, "plugin");
      yield* write(root, "outside/SKILL.md", "# Outside package\n");
      yield* write(
        plugin,
        ".claude-plugin/plugin.json",
        JSON.stringify({
          name: "reviews",
          skills: [kind === "lexical" ? "../outside" : "./linked"],
        }),
      );
      if (kind === "symlink") yield* fs.symlink("../outside", path.join(plugin, "linked"));
      const failure = yield* discoverExtensionPackages(plugin, filter).pipe(Effect.flip);
      expect(failure.category).toBe("validation");
      expect(failure.detail).toContain("escapes");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Agent Plugins core manifest validation", () => {
  it.effect.each([
    { name: "" },
    { name: "Uppercase" },
    { name: "a".repeat(65) },
    { name: "double--hyphen" },
    { name: "double..period" },
    { version: 42 },
    { keywords: [42] },
    { author: { unknown: "value" } },
    { author: { email: 42 } },
  ])("refuses invalid declared core fields: %j", (fields) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-plugin-invalid-" });
      yield* write(
        root,
        "plugin.json",
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "reviews",
          ...fields,
        }),
      );
      yield* write(root, "skills/review/SKILL.md", "# Review\n");
      const result = yield* discoverExtensionPackages(root, filter).pipe(Effect.result);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          category: "validation",
          detail: expect.stringContaining("Agent Plugins manifest"),
        },
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("accepts descriptive strings without imposing unrelated publication formats", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-plugin-metadata-" });
      const manifest = JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "a.tools",
        version: "next week",
        homepage: "internal docs",
        repository: "elsewhere",
        license: "custom terms",
        author: { email: "ask in person", url: "team directory" },
        extensions: 42,
        future: { retained: true },
      });
      yield* write(root, "plugin.json", manifest);
      yield* write(root, "skills/review/SKILL.md", "# Review\n");
      expect(yield* discoverExtensionPackages(root, filter)).toHaveLength(1);
      const path = yield* Path.Path;
      expect(yield* fs.readFileString(path.join(root, "plugin.json"))).toBe(manifest);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

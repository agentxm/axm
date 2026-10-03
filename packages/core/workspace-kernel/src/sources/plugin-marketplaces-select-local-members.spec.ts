import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { discoverExtensionPackages } from "./index.js";

export const specification = defineSpecification({
  requirement: "skills/acquisition/plugin-marketplaces-select-local-members",
  title: "Local plugin marketplace members retain their dialect's selection rules",
  statement:
    "AXM shall discover local members of supported Claude, Codex, and Cursor marketplaces within the source boundary, retain each member's package root independently from its selected skill paths, and record the marketplace declaration separately from upstream payloads. Claude root marketplace selections shall suppress default skill discovery, ordinary Claude additions shall augment it, and Cursor manifest declarations shall override marketplace fields and default discovery. Conflicting Claude strict declarations, malformed local source declarations, escaping local members, and Cursor marketplace manifests larger than 10 MB shall be refused. Unselected remote entries shall not trigger acquisition; a request naming such an unsupported entry shall explain how to install its source directly.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Real directories and links establish package containment and source-relative selection through the public discovery API.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const filter = { names: [], owner: Option.none(), type: "skill" } as const;
const write = (root: string, relative: string, value: string | Readonly<Record<string, unknown>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join(root, relative);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, typeof value === "string" ? value : JSON.stringify(value));
  });
const paths = (found: Effect.Success<ReturnType<typeof discoverExtensionPackages>>) =>
  found.map((entry) => (entry.kind === "portable-skill" ? entry.sourcePath : "manifest"));
const fixture = Effect.gen(function* () {
  return yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
    prefix: "axm-plugin-marketplace-",
  });
});

describe("Local plugin marketplaces", () => {
  it.effect("selects only a Claude marketplace root entry's declared skills", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      yield* write(root, ".claude-plugin/marketplace.json", {
        plugins: [{ name: "selected", source: "./", skills: ["./skills/review"] }],
      });
      yield* write(root, "skills/review/SKILL.md", "# Review\n");
      yield* write(root, "skills/other/SKILL.md", "# Inactive\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(paths(found)).toEqual(["skills/review"]);
      expect(found[0]).toMatchObject({
        distribution: {
          packageRoot: ".",
          componentPath: "skills/review",
          marketplace: { path: ".claude-plugin/marketplace.json", name: "selected" },
        },
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("combines Claude default, manifest, and marketplace skill directories", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      yield* write(root, ".claude-plugin/marketplace.json", {
        plugins: [{ name: "reviewers", source: "./plugin", skills: ["./entry"] }],
      });
      yield* write(root, "plugin/.claude-plugin/plugin.json", {
        name: "reviewers",
        skills: "./manifest",
      });
      for (const directory of ["skills/default", "entry", "manifest"])
        yield* write(root, `plugin/${directory}/SKILL.md`, "# Skill\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(paths(found)).toEqual(["plugin/entry", "plugin/manifest", "plugin/skills/default"]);
      for (const item of found)
        expect(item).toMatchObject({
          distribution: { packageRoot: "plugin", manifestPath: ".claude-plugin/plugin.json" },
        });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses conflicting Claude entry components under strict false", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      yield* write(root, ".claude-plugin/marketplace.json", {
        plugins: [{ name: "reviewers", source: "./plugin", strict: false, skills: "./entry" }],
      });
      yield* write(root, "plugin/.claude-plugin/plugin.json", { name: "reviewers" });
      yield* write(root, "plugin/entry/SKILL.md", "# Skill\n");
      const failure = yield* discoverExtensionPackages(root, filter).pipe(Effect.flip);
      expect(failure.detail).toContain("conflicts");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("loads Codex local source objects and preserves the declaration identity", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      yield* write(root, ".agents/plugins/marketplace.json", {
        plugins: [
          {
            name: "reviewers",
            source: { source: "local", path: "./plugins/reviews" },
            policy: { authentication: "ON_INSTALL" },
          },
        ],
      });
      yield* write(root, "plugins/reviews/.codex-plugin/plugin.json", {
        name: "reviews",
        skills: "./skills",
      });
      yield* write(root, "plugins/reviews/skills/review/SKILL.md", "# Skill\n");
      yield* write(root, "unlisted/skills/other/SKILL.md", "# Unlisted\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(paths(found)).toEqual(["plugins/reviews/skills/review"]);
      expect(found[0]).toMatchObject({
        distribution: {
          format: "codex",
          packageRoot: "plugins/reviews",
          componentPath: "skills/review",
          marketplace: { path: ".agents/plugins/marketplace.json", name: "reviewers" },
        },
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("lets Cursor manifest paths override entry paths and defaults under pluginRoot", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      yield* write(root, ".cursor-plugin/marketplace.json", {
        metadata: { pluginRoot: "./packages" },
        plugins: [{ name: "reviewers", source: { path: "reviews" }, skills: "./entry" }],
      });
      yield* write(root, "packages/reviews/.cursor-plugin/plugin.json", {
        name: "reviewers",
        skills: ["./manifest"],
      });
      for (const directory of ["skills/default", "entry", "manifest"])
        yield* write(root, `packages/reviews/${directory}/SKILL.md`, "# Skill\n");
      expect(paths(yield* discoverExtensionPackages(root, filter))).toEqual([
        "packages/reviews/manifest",
      ]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("uses Cursor marketplace component paths when the package has no manifest", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      yield* write(root, ".cursor-plugin/marketplace.json", {
        plugins: [{ name: "reviewers", source: "reviews", skills: "./entry" }],
      });
      for (const directory of ["skills/default", "entry"])
        yield* write(root, `reviews/${directory}/SKILL.md`, "# Skill\n");
      expect(paths(yield* discoverExtensionPackages(root, filter))).toEqual(["reviews/entry"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each(["lexical", "symlink"] as const)("refuses a %s member escape", (kind) =>
    Effect.gen(function* () {
      const root = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* write(root, "outside/SKILL.md", "# Outside\n");
      yield* write(root, "catalog/.claude-plugin/marketplace.json", {
        plugins: [{ name: "outside", source: kind === "lexical" ? "../outside" : "./linked" }],
      });
      if (kind === "symlink") yield* fs.symlink("../outside", path.join(root, "catalog/linked"));
      const failure = yield* discoverExtensionPackages(path.join(root, "catalog"), filter).pipe(
        Effect.flip,
      );
      expect(failure.detail).toContain("escapes");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("does not fetch remote members and explains an explicit unsupported selection", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      yield* write(root, ".claude-plugin/marketplace.json", {
        plugins: [{ name: "remote", source: { source: "github", repo: "vendor/plugin" } }],
      });
      expect(yield* discoverExtensionPackages(root, filter)).toEqual([]);
      const failure = yield* discoverExtensionPackages(root, { ...filter, names: ["remote"] }).pipe(
        Effect.flip,
      );
      expect(failure.detail).toContain("install its Git or HTTPS source directly");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Bounded marketplace declarations", () => {
  it.effect.each([
    { manifest: ".agents/plugins/marketplace.json", source: { source: "local", path: 42 } },
    { manifest: ".agents/plugins/marketplace.json", source: { source: "local" } },
    { manifest: ".cursor-plugin/marketplace.json", source: { path: 42 } },
    { manifest: ".cursor-plugin/marketplace.json", source: null },
  ])(
    "reports malformed local declarations without calling them remote: %j",
    ({ manifest, source }) =>
      Effect.gen(function* () {
        const root = yield* fixture;
        yield* write(root, manifest, { plugins: [{ name: "reviews", source }] });
        const result = yield* discoverExtensionPackages(root, filter).pipe(Effect.result);
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: {
            category: "validation",
            detail: expect.stringContaining("invalid local source"),
          },
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("refuses an oversized Cursor marketplace before reading it into memory", () =>
    Effect.gen(function* () {
      const root = yield* fixture;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const manifest = path.join(root, ".cursor-plugin/marketplace.json");
      yield* write(root, ".cursor-plugin/marketplace.json", '{"plugins":[]}');
      yield* fs.truncate(manifest, 10_000_001);
      const guarded = {
        ...fs,
        readFileString: (file: string, encoding?: string) =>
          file === manifest
            ? Effect.die("oversized marketplace must not be loaded")
            : fs.readFileString(file, encoding),
      } satisfies FileSystem.FileSystem;
      const result = yield* discoverExtensionPackages(root, filter).pipe(
        Effect.provideService(FileSystem.FileSystem, guarded),
        Effect.result,
      );
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { category: "validation", detail: expect.stringContaining("10 MB") },
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

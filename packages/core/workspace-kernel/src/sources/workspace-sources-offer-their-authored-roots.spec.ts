import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";
import { SourceNotResolvable } from "./errors.js";
import { discoverExtensionPackages, type DiscoveredExtensionPackage } from "./package-discovery.js";

export const specification = defineSpecification({
  requirement: "extension-discovery/workspace-sources-offer-their-authored-roots",
  title: "A workspace source offers what its authored roots hold",
  statement:
    "When a source root carries AXM workspace settings and is not itself a package, discovery shall offer exactly the packages directly inside the root's authored type directories, each the configured directory or else the default, shall not offer a package anywhere else beneath that root, and shall refuse the source when its settings place an authored directory where a workspace cannot keep one; for any source root that is not itself a package, discovery shall report the packages beneath the root's install root as held rather than offered, at whatever depth they sit, and shall keep a package the source also authors as the source's own; a directory named as the source root shall be classified by its own contents, and a root without workspace settings shall keep ordinary repository discovery.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "extension-adoption"],
  methods: ["example", "decision-table"],
  derivedFrom: ["extension-discovery/all-manifest-kinds-from-git-and-path"],
  supersedes: [],
  assumptions: [
    "A source root carries workspace settings when `axm.json` sits directly in it, and keeps the packages it acquired beneath `agent_extensions/` directly in it.",
  ],
  openQuestions: [
    "Should a workspace source offer a package that sits in an authored root but that its settings do not declare, as it does today, or only its declared entries?",
    "Should a workspace beneath the source root, with settings of its own, contribute what it authors to the enclosing source's offer?",
  ],
});

const filter = { names: [], owner: Option.none(), type: "*" } as const;

const writeManifest = (
  root: string,
  directory: string,
  type: string,
  name: string,
  owner = "@acme",
): void => {
  const packageDirectory = path.join(root, directory);
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(packageDirectory, `${type}.json`),
    `${JSON.stringify(
      type === "pack"
        ? { owner, type, name, version: "1.0.0", dependencies: {} }
        : { owner, type, name, version: "1.0.0" },
    )}\n`,
  );
};

const writePortableSkill = (root: string, directory: string, name: string): void => {
  fs.mkdirSync(path.join(root, directory), { recursive: true });
  fs.writeFileSync(
    path.join(root, directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: The ${name} skill\n---\n\n# ${name}\n`,
  );
};

const writeSettings = (root: string, settings: Readonly<Record<string, unknown>>): void => {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "axm.json"),
    `${JSON.stringify({ owner: "@acme", ...settings })}\n`,
  );
};

const discover = (root: string) =>
  discoverExtensionPackages(root, filter).pipe(Effect.provide(NodeServices.layer));

const named = (
  root: string,
  candidates: ReadonlyArray<DiscoveredExtensionPackage>,
): ReadonlyArray<string> =>
  candidates
    .map(
      (candidate) =>
        `${candidate.standing} ${path.relative(root, candidate.directory).split(path.sep).join("/") || "."}`,
    )
    .sort();

describe("What a workspace source offers", () => {
  const roots: Array<string> = [];
  const makeRoot = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-workspace-source-"));
    roots.push(root);
    return root;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("offers the packages in its default authored roots and nothing beside them", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, {});
      writeManifest(root, "skills/review", "skill", "review");
      writeManifest(root, "rules/style", "rule", "style");
      writeManifest(root, "packs/kit", "pack", "kit");
      writePortableSkill(root, "skills/notes", "notes");
      // A fixture, an example, and a nested folder are not where the workspace authors.
      writeManifest(root, "test/fixtures/sample", "skill", "sample");
      writePortableSkill(root, "examples/demo", "demo");
      writeManifest(root, "skills/drafts/later", "skill", "later");

      expect(named(root, yield* discover(root))).toEqual([
        "offered packs/kit",
        "offered rules/style",
        "offered skills/notes",
        "offered skills/review",
      ]);
    }),
  );

  it.effect("reads a configured authored directory in place of the default", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, { skillsConfig: { dir: "extensions/skills" } });
      writeManifest(root, "extensions/skills/review", "skill", "review");
      writeManifest(root, "skills/stale", "skill", "stale");
      writeManifest(root, "rules/style", "rule", "style");

      expect(named(root, yield* discover(root))).toEqual([
        "offered extensions/skills/review",
        "offered rules/style",
      ]);
    }),
  );

  it.effect("offers a package whatever its folder is called, including a tool-cache name", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, {});
      writeManifest(root, "skills/build", "skill", "build");

      expect(named(root, yield* discover(root))).toEqual(["offered skills/build"]);
    }),
  );

  it.effect("holds what sits beneath the install root, however deep, without offering it", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, {});
      writeManifest(root, "skills/review", "skill", "review");
      writeManifest(
        root,
        "agent_extensions/registry.example/@other/skills/audit",
        "skill",
        "audit",
        "@other",
      );
      writePortableSkill(
        root,
        "agent_extensions/github.com/other/collection/tools/skills/deep/trace",
        "trace",
      );

      expect(named(root, yield* discover(root))).toEqual([
        "held agent_extensions/github.com/other/collection/tools/skills/deep/trace",
        "held agent_extensions/registry.example/@other/skills/audit",
        "offered skills/review",
      ]);
    }),
  );

  it.effect("keeps a package it authors as its own when it also holds a copy", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, {});
      writeManifest(root, "skills/review", "skill", "review");
      writeManifest(
        root,
        "agent_extensions/registry.example/@acme/skills/review",
        "skill",
        "review",
      );

      expect(named(root, yield* discover(root))).toEqual(["offered skills/review"]);
    }),
  );

  it.effect.each([
    { label: "an absolute path", dir: "/elsewhere/skills" },
    { label: "a path that leaves the workspace", dir: "../skills" },
    { label: "the install root", dir: "agent_extensions/skills" },
    { label: "an agent's projection root", dir: ".claude/skills" },
    { label: "another type's authored root", dir: "rules" },
  ])("refuses a source whose skills directory is $label", ({ dir }) =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, { skillsConfig: { dir } });
      writeManifest(root, "skills/review", "skill", "review");

      const failure = yield* discover(root).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(SourceNotResolvable);
      expect(failure).toMatchObject({ category: "validation" });
      expect(failure.detail).toContain(path.join(root, "axm.json"));
    }),
  );

  it.effect("classifies a directory named as the root by its own contents", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, {});
      writeManifest(root, "skills/review", "skill", "review");
      writeManifest(root, "test/fixtures/sample", "skill", "sample");
      writeManifest(
        root,
        "agent_extensions/registry.example/@other/skills/audit",
        "skill",
        "audit",
        "@other",
      );

      const fixtures = path.join(root, "test", "fixtures");
      expect(named(fixtures, yield* discover(fixtures))).toEqual(["offered sample"]);
      const installRoot = path.join(root, "agent_extensions");
      expect(named(installRoot, yield* discover(installRoot))).toEqual([
        "offered registry.example/@other/skills/audit",
      ]);
    }),
  );

  it.effect("leaves a root that is itself a package to that package's own layout", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writeSettings(root, {});
      writePortableSkill(root, ".", "standalone");
      writeManifest(root, "skills/review", "skill", "review");

      expect(named(root, yield* discover(root))).toEqual(["offered ."]);
    }),
  );

  it.effect("keeps ordinary repository discovery for a root without workspace settings", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      writePortableSkill(root, "collection/writing/outline", "outline");
      writeManifest(root, "tools/review", "skill", "review");
      writeManifest(
        root,
        "agent_extensions/registry.example/@other/skills/audit",
        "skill",
        "audit",
        "@other",
      );

      expect(named(root, yield* discover(root))).toEqual([
        "held agent_extensions/registry.example/@other/skills/audit",
        "offered collection/writing/outline",
        "offered tools/review",
      ]);
    }),
  );
});

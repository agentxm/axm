import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { unzipSync, zipSync } from "fflate";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { GitDirectoryComparisonService } from "@agentxm/workspace-kernel/sources";

import { normalizeTypePublishSelection, type PublishRequest } from "../publish/model.js";
import type { PublishResultItem } from "../publish/result.js";
import type { PublishableType } from "../publishable-types.js";
import { authoredSettingsKey } from "../testing.js";
import {
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/existing-versions-skip-before-preparation",
  title: "Already published versions are skipped before any preparation",
  statement:
    "For every publish selection, publish shall report a selected version the Registry already has, yanked included, as a successful skip decided by that presence alone, without linting, archiving, validating, reviewing the Git source of, or comparing the content of that version, and shall prepare and upload only the selected versions the Registry lacks, where a preparation failure of any of those blocks every upload while the already published versions remain successful skips.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/publish/existing-versions-require-explicit-policy",
    "apps/cli/help/topics/publish.md",
    "apps/cli/src/root/publish/command.ts",
    "apps/cli/src/root/publish/per-type-command.ts",
  ],
  supersedes: ["cli/publish/existing-versions-require-explicit-policy"],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Every example publishes into a file Registry, whose index is edited directly to stand for a yanked version or an archive built with an older encoding; a remote Registry's own version records are not exercised here.",
      retirementCondition:
        "A remote Registry fixture can report yanked versions and recorded integrity, and the rows run against it as well.",
    },
  ],
});

/** Every publishable type, with the route segment its fully qualified name uses. */
const publicationTypes = [
  { type: "skill", route: "skills" },
  { type: "mcp-server", route: "mcps" },
  { type: "subagent", route: "subagents" },
  { type: "rule", route: "rules" },
  { type: "hook", route: "hooks" },
  { type: "knowledge", route: "knowledge" },
  { type: "pack", route: "packs" },
] as const satisfies ReadonlyArray<{ readonly type: PublishableType; readonly route: string }>;

const skillRoot = (world: PublishWorld, name: string): string =>
  nodePath.join(world.root, "skills", name);

const indexPath = (world: PublishWorld, name: string): string =>
  nodePath.join(world.target.root, "extensions", "@acme", "skills", name, "index.json");

/**
 * Rewrite one entry of a published skill's Registry index. The file Registry
 * keeps the index as JSON, so an example can stand for a Registry state the
 * current CLI would never produce by itself.
 */
const editVersionEntry = (
  world: PublishWorld,
  name: string,
  edit: (entry: Record<string, unknown>) => Record<string, unknown>,
): void => {
  const path = indexPath(world, name);
  const index: unknown = JSON.parse(fs.readFileSync(path, "utf8"));
  if (typeof index !== "object" || index === null || !("versions" in index)) {
    throw new Error(`Expected a Registry index at ${path}`);
  }
  const versions: unknown = index.versions;
  if (!Array.isArray(versions)) throw new Error(`Expected index versions at ${path}`);
  fs.writeFileSync(
    path,
    JSON.stringify({
      ...index,
      versions: versions.map((entry: unknown) => {
        if (typeof entry !== "object" || entry === null) throw new Error("Expected a version");
        return edit(Object.fromEntries(Object.entries(entry)));
      }),
    }),
  );
};

/**
 * Replace a published skill's stored archive with the same entries compressed
 * with deflate, as an earlier CLI built archives, and record that archive's
 * integrity. A fresh local build of the unchanged source no longer matches it.
 */
const reencodeWithDeflate = (world: PublishWorld, name: string): void => {
  const deflated = zipSync(unzipSync(world.archive(name)), { level: 6 });
  fs.writeFileSync(
    nodePath.join(world.target.root, "extensions", "@acme", "skills", name, "1.0.0.zip"),
    deflated,
  );
  const integrity = `sha512-${createHash("sha512").update(deflated).digest("base64")}`;
  editVersionEntry(world, name, (entry) => ({ ...entry, integrity }));
};

const markYanked = (world: PublishWorld, name: string): void =>
  editVersionEntry(world, name, (entry) => ({
    ...entry,
    yankedAt: "2026-09-01T00:00:00.000Z",
    yankCategory: "superseded",
  }));

const changeContent = (world: PublishWorld, name: string): void =>
  fs.appendFileSync(
    nodePath.join(skillRoot(world, name), "src", "SKILL.md"),
    "\nDifferent release content.\n",
  );

/** The row a run reports for one fully qualified name. */
const rowFor = (rows: ReadonlyArray<PublishResultItem>, id: string): PublishResultItem => {
  const row = rows.find((item) => item.id === id);
  if (row === undefined) throw new Error(`Expected a result row for ${id}`);
  return row;
};

const expectAlreadyPublished = (row: PublishResultItem): void => {
  expect(row).toMatchObject({
    action: "skip",
    status: "success",
    reason: "version_already_published",
  });
  expect(row).not.toHaveProperty("archive");
};

describe("Versions the Registry already has", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  /**
   * Three published skills whose local or Registry state now differs from a
   * fresh build in every way an earlier rule inspected, and two new skills.
   */
  const mixedWorld = () =>
    Effect.gen(function* () {
      const names = ["changed", "deflated", "yanked", "fresh", "second"];
      const world = makePublishWorld({
        settings: { skills: Object.fromEntries(names.map((name) => [name, "workspace"])) },
      });
      worlds.push(world);
      for (const name of ["changed", "deflated", "yanked"]) world.write("skill", { name });
      yield* world.provide(runPublish(requestFor(world, { preview: false })));
      changeContent(world, "changed");
      reencodeWithDeflate(world, "deflated");
      markYanked(world, "yanked");
      world.write("skill", { name: "fresh" });
      world.write("skill", { name: "second" });
      return world;
    });

  for (const selection of [
    { name: "bare", request: {} },
    { name: "filtered", request: { owners: ["@acme"], types: ["skill"] } },
  ] satisfies ReadonlyArray<{ name: string; request: Partial<PublishRequest> }>) {
    it.effect(`${selection.name} selection uploads exactly the versions the Registry lacks`, () =>
      Effect.gen(function* () {
        const world = yield* mixedWorld();
        const existing = Object.fromEntries(
          ["changed", "deflated", "yanked"].map((name) => [name, world.archive(name)]),
        );

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { ...selection.request, preview: false })),
        );

        expect(outcome.disposition._tag).toBe("Completed");
        const document = publishDocument(outcome);
        expect(document.counts).toMatchObject({
          selected: 5,
          published: 2,
          alreadyPublished: 3,
          failed: 0,
          blocked: 0,
        });
        for (const name of ["changed", "deflated", "yanked"]) {
          expectAlreadyPublished(rowFor(document.execution.outcomes, `@acme/skills/${name}`));
          expect(world.archive(name)).toEqual(existing[name]);
        }
        for (const name of ["fresh", "second"]) {
          expect(rowFor(document.execution.outcomes, `@acme/skills/${name}`)).toMatchObject({
            action: "publish",
            status: "success",
          });
          expect(world.archive(name).length).toBeGreaterThan(0);
        }
      }),
    );
  }

  it.effect("a preview classifies every version as the apply does and stores nothing", () =>
    Effect.gen(function* () {
      const world = yield* mixedWorld();
      const before = world.snapshotRegistry();
      const storedBefore = world.target.storedFiles();

      const preview = yield* world.provide(runPublish(requestFor(world, { preview: true })));

      expect(world.target.storedFiles()).toEqual(storedBefore);
      expect(world.snapshotRegistry()).toEqual(before);
      const previewed = publishDocument(preview);
      expect(previewed.counts).toMatchObject({ selected: 5, alreadyPublished: 3, failed: 0 });

      const applied = publishDocument(
        yield* world.provide(runPublish(requestFor(world, { preview: false }))),
      );
      const classification = (rows: ReadonlyArray<PublishResultItem>) =>
        rows.map(({ id, action, reason }) => ({ id, action, reason }));
      expect(
        classification(previewed.execution.outcomes.filter((row) => row.action === "skip")),
      ).toEqual(classification(applied.execution.outcomes.filter((row) => row.action === "skip")));
      expect(
        previewed.execution.outcomes
          .filter((row) => row.action === "publish")
          .map(({ id }) => id)
          .sort(),
      ).toEqual(["@acme/skills/fresh", "@acme/skills/second"]);
    }),
  );

  describe("an existing version is settled before any of its content is prepared", () => {
    const dirtyComparisons: Array<string> = [];
    let reportDirtySource = false;
    const compare: GitDirectoryComparisonService["compare"] = ({ directory }) =>
      Effect.sync(() => {
        if (!reportDirtySource) return Option.none();
        dirtyComparisons.push(nodePath.basename(directory));
        return Option.some({
          repositoryRoot: nodePath.dirname(nodePath.dirname(directory)),
          repositoryDirectory: `skills/${nodePath.basename(directory)}`,
          headRevision: "0123456789abcdef0123456789abcdef01234567",
          differences: [{ path: "src/SKILL.md", change: "modified" }],
        });
      });

    for (const row of [
      {
        name: "local content differs from the published archive",
        change: (world: PublishWorld) => changeContent(world, "review"),
      },
      {
        name: "the Registry recorded the integrity of a deflate-built archive",
        change: (world: PublishWorld) => reencodeWithDeflate(world, "review"),
      },
      {
        name: "the version is yanked",
        change: (world: PublishWorld) => markYanked(world, "review"),
      },
      {
        name: "the package would now fail the fixed lint gate",
        change: (world: PublishWorld) =>
          fs.rmSync(nodePath.join(skillRoot(world, "review"), "src", "SKILL.md")),
      },
      {
        name: "the archive would now contain a forbidden entry",
        change: (world: PublishWorld) =>
          fs.writeFileSync(nodePath.join(skillRoot(world, "review"), ".env"), "SYNTHETIC=1\n"),
      },
      {
        name: "the source differs from Git HEAD",
        change: () => {
          reportDirtySource = true;
        },
      },
    ]) {
      it.effect(row.name, () =>
        Effect.gen(function* () {
          dirtyComparisons.length = 0;
          reportDirtySource = false;
          const world = makePublishWorld({
            settings: { skills: { review: "workspace" } },
            compare,
          });
          worlds.push(world);
          world.write("skill", { name: "review" });
          yield* world.provide(runPublish(requestFor(world, { preview: false })));
          row.change(world);
          const before = world.snapshotRegistry();

          const outcome = yield* world.provide(
            runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
          );

          expect(outcome.disposition._tag).toBe("Completed");
          const document = publishDocument(outcome);
          expect(document.counts).toMatchObject({ alreadyPublished: 1, failed: 0, blocked: 0 });
          expectAlreadyPublished(rowFor(document.execution.outcomes, "@acme/skills/review"));
          expect(world.snapshotRegistry()).toEqual(before);
          expect(dirtyComparisons).toEqual([]);
        }),
      );
    }
  });

  for (const type of publicationTypes) {
    it.effect(`explicitly naming an existing ${type.type} version is a successful skip`, () =>
      Effect.gen(function* () {
        const world = makePublishWorld({
          settings: { [authoredSettingsKey[type.type]]: { review: { source: "workspace" } } },
        });
        worlds.push(world);
        world.write(type.type, { name: "review" });
        yield* world.provide(runPublish(requestFor(world, { preview: false })));
        const before = world.snapshotRegistry();
        const fqn = `@acme/${type.route}/review`;

        const typeSelection = (selectors: ReadonlyArray<string>) =>
          normalizeTypePublishSelection({ type: type.type, selectors, owners: [], excludes: [] });
        const selections: ReadonlyArray<readonly [string, Partial<PublishRequest>]> = [
          ["root fully qualified name", { selectors: [fqn] }],
          ["root type-qualified name", { selectors: [`${type.route}/review`] }],
          ["root glob", { selectors: [`@acme/${type.route}/*`] }],
          ["type-specific name", yield* typeSelection(["review"])],
          ["type-specific glob", yield* typeSelection(["r*"])],
          ["type-specific fully qualified name", yield* typeSelection([fqn])],
        ];
        for (const [label, selection] of selections) {
          const outcome = yield* world.provide(
            runPublish(requestFor(world, { ...selection, preview: false })),
          );

          expect(outcome.disposition._tag, label).toBe("Completed");
          const document = publishDocument(outcome);
          expect(document.counts, label).toMatchObject({
            selected: 1,
            alreadyPublished: 1,
            failed: 0,
          });
          expectAlreadyPublished(rowFor(document.execution.outcomes, fqn));
          expect(world.snapshotRegistry(), label).toEqual(before);
        }
      }),
    );
  }

  it.effect("an included dependency already published is skipped while its new pack uploads", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({
        settings: {
          skills: { review: "workspace" },
          packs: { toolkit: "workspace" },
        },
      });
      worlds.push(world);
      world.write("skill", { name: "review" });
      yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );
      const reviewArchive = world.archive("review");
      world.write("pack", { name: "toolkit", dependencies: { "@acme/skills/review": "^1.0.0" } });

      const outcome = yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/packs/toolkit"],
            includeDependencies: true,
            preview: false,
          }),
        ),
      );

      expect(outcome.disposition._tag).toBe("Completed");
      const rows = publishDocument(outcome).execution.outcomes;
      expectAlreadyPublished(rowFor(rows, "@acme/skills/review"));
      expect(rowFor(rows, "@acme/packs/toolkit")).toMatchObject({
        action: "publish",
        status: "success",
      });
      expect(world.archive("review")).toEqual(reviewArchive);
      expect(world.archive("toolkit", "1.0.0", "packs").length).toBeGreaterThan(0);
    }),
  );

  it.effect("one invalid new version blocks every upload but no already published version", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({
        settings: {
          skills: {
            review: "workspace",
            deploy: "workspace",
            broken: "workspace",
          },
        },
      });
      worlds.push(world);
      world.write("skill", { name: "review" });
      yield* world.provide(runPublish(requestFor(world, { preview: false })));
      changeContent(world, "review");
      world.write("skill", { name: "deploy" });
      world.write("skill", { name: "broken", withoutContent: true });
      const before = world.snapshotRegistry();

      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.snapshotRegistry()).toEqual(before);
      const rows = publishDocument(outcome).execution.outcomes;
      expectAlreadyPublished(rowFor(rows, "@acme/skills/review"));
      expect(rowFor(rows, "@acme/skills/broken")).toMatchObject({ status: "failed" });
      expect(rowFor(rows, "@acme/skills/deploy")).toMatchObject({
        status: "blocked",
        reason: "blocked_by_preflight",
        blockedBy: ["@acme/skills/broken"],
      });
    }),
  );

  it.effect("a publication set the Registry refuses blocks every upload but no skip", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({
        settings: {
          skills: { review: "workspace", draft: "workspace" },
          packs: { toolkit: "workspace" },
        },
      });
      worlds.push(world);
      world.write("skill", { name: "review" });
      yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );
      // The pack depends on a skill this workspace authors but the Registry
      // lacks and the selection leaves out, so the Registry refuses the set.
      world.write("skill", { name: "draft" });
      world.write("pack", { name: "toolkit", dependencies: { "@acme/skills/draft": "^1.0.0" } });
      const storedBefore = world.target.storedFiles();

      const outcome = yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review", "@acme/packs/toolkit"],
            preview: false,
          }),
        ),
      );

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.target.storedFiles()).toEqual(storedBefore);
      const rows = publishDocument(outcome).execution.outcomes;
      expectAlreadyPublished(rowFor(rows, "@acme/skills/review"));
      expect(rowFor(rows, "@acme/packs/toolkit")).toMatchObject({
        phase: "authoritative_preflight",
        status: "blocked",
        reason: "blocked_by_preflight",
      });
    }),
  );
});

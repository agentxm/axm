import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { discoverExtensionPackages } from "./index.js";

export const specification = defineSpecification({
  requirement: "skills/acquisition/external-skills-keep-source-boundaries",
  title: "External skill discovery preserves source selection and payload boundaries",
  statement:
    "When discovering external skills, AXM shall recognize conventional and nested skill directories regardless of descriptive frontmatter, distinguish same-name candidates by source path, honor exact source-path selection, and stop discovery at each skill payload boundary.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "Real directory trees establish conventional discovery, exact path selection, and stopping at payload boundaries through the public source-discovery entry.",
  methods: ["example", "decision-table"],
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

describe("External skill source boundaries", () => {
  it.effect("retains a long upstream display name while deriving a bounded management key", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-source-long-name-" });
      const name = `Review${"-".repeat(100_000)}Finish`;
      const content = `---\nname: ${name}\n---\nUnchanged guidance.\n`;
      yield* write(root, "review-package/SKILL.md", content);
      const found = yield* discoverExtensionPackages(`${root}/review-package`, filter);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        kind: "portable-skill",
        name: "review-package",
        skill: { displayName: name },
      });
      expect(yield* fs.readFileString(`${root}/review-package/SKILL.md`)).toBe(content);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("does not let an unrelated plugin.json hide a repository collection", () =>
    Effect.gen(function* () {
      const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
        prefix: "axm-source-unrelated-plugin-",
      });
      yield* write(root, "plugin.json", '{"name":"editor-plugin","build":"index.js"}');
      yield* write(root, "collections/review/SKILL.md", "# Original skill\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ sourcePath: "collections/review" });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each([
    "SKILL.md",
    "skills/review/SKILL.md",
    ".agents/skills/review/SKILL.md",
    ".claude/skills/review/SKILL.md",
    ".codex/skills/review/SKILL.md",
    ".cursor/skills/review/SKILL.md",
    "collections/team/skills/review/SKILL.md",
  ])("discovers unchanged skill content at %s", (relative) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-source-layout-" });
      const content = "---\nname: Friendly Review\nvendor-setting: true\n---\nOriginal guidance.\n";
      yield* write(root, relative, content);
      const found = yield* discoverExtensionPackages(root, filter);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        kind: "portable-skill",
        skill: { displayName: "Friendly Review" },
      });
      expect(yield* fs.readFileString(`${root}/${relative}`)).toBe(content);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps same-name candidates distinct and selects the exact source path", () =>
    Effect.gen(function* () {
      const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
        prefix: "axm-source-selection-",
      });
      for (const directory of ["teams/one/review", "teams/two/review"])
        yield* write(root, `${directory}/SKILL.md`, "---\nname: Review\n---\n");
      const all = yield* discoverExtensionPackages(root, filter);
      expect(all).toHaveLength(2);
      const names = all.flatMap((item) => (item.kind === "portable-skill" ? [item.name] : []));
      expect(new Set(names).size).toBe(2);
      for (const candidate of all) {
        if (candidate.kind !== "portable-skill") throw new Error("Expected a portable skill");
        const selected = yield* discoverExtensionPackages(root, {
          ...filter,
          names: [candidate.sourcePath],
        });
        expect(selected).toEqual([candidate]);
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("treats nested examples and plugin manifests inside a skill as payload", () =>
    Effect.gen(function* () {
      const root = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
        prefix: "axm-source-payload-",
      });
      yield* write(root, "skills/review/SKILL.md", "# Review guidance\n");
      yield* write(root, "skills/review/plugin.json", '{"name":"example"}');
      yield* write(root, "skills/review/examples/nested/SKILL.md", "# Documentation example\n");
      const found = yield* discoverExtensionPackages(root, filter);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ kind: "portable-skill", sourcePath: "skills/review" });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

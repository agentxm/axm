/**
 * Legacy discovery tests — updated for new 3-phase discoverSkillsInDir signature.
 *
 * Comprehensive discovery tests live in discover-skills.test.ts.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  DiscoveryError,
  discoverSkillsInDir,
} from "../../cli-commands/skills/install/discover-skills.js";

const defaultOptions = { fullDepth: false, includeInternal: false };

/**
 * Create a SKILL.md with valid frontmatter.
 */
const createSkillMd = (dir: string, name: string, description: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "${description}"\n---\n\n# ${name}\n`,
  );
};

describe("discoverSkills", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-discovery-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, NodeContext.NodeContext>) =>
    effect.pipe(Effect.provide(NodeContext.layer));

  it.effect("returns empty array for directory with no skills", () =>
    withFileSystem(
      Effect.gen(function* () {
        const result = yield* discoverSkillsInDir(tempDir, Option.none(), defaultOptions);
        expect(result).toEqual([]);
      }),
    ),
  );

  it.effect("discovers a single SKILL.md file", () =>
    withFileSystem(
      Effect.gen(function* () {
        const skillDir = path.join(tempDir, "my-skill");
        createSkillMd(skillDir, "my-skill", "My skill");

        const result = yield* discoverSkillsInDir(tempDir, Option.none(), defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.skill.name).toBe("my-skill");
        expect(Option.getOrThrow(result[0]!.path)).toBe(skillDir);
      }),
    ),
  );

  it.effect("discovers multiple skills", () =>
    withFileSystem(
      Effect.gen(function* () {
        createSkillMd(path.join(tempDir, "commit"), "commit", "Commit skill");
        createSkillMd(path.join(tempDir, "review-pr"), "review-pr", "Review PR skill");

        const result = yield* discoverSkillsInDir(tempDir, Option.none(), defaultOptions);

        expect(result).toHaveLength(2);
        const names = result.map((s) => s.skill.name).sort();
        expect(names).toEqual(["commit", "review-pr"]);
      }),
    ),
  );

  it.effect("discovers nested skills via recursive fallback", () =>
    withFileSystem(
      Effect.gen(function* () {
        createSkillMd(
          path.join(tempDir, "category", "nested-skill"),
          "nested-skill",
          "Nested skill",
        );

        const result = yield* discoverSkillsInDir(tempDir, Option.none(), defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.skill.name).toBe("nested-skill");
      }),
    ),
  );

  it.effect("only recognizes exact SKILL.md (case-sensitive)", () =>
    withFileSystem(
      Effect.gen(function* () {
        // Create skills with different SKILL.md casings
        const skill1Dir = path.join(tempDir, "skill-lower");
        const skill2Dir = path.join(tempDir, "skill-upper");
        const skill3Dir = path.join(tempDir, "skill-mixed");
        fs.mkdirSync(skill1Dir, { recursive: true });
        fs.mkdirSync(skill2Dir, { recursive: true });
        fs.mkdirSync(skill3Dir, { recursive: true });
        fs.writeFileSync(
          path.join(skill1Dir, "skill.md"),
          '---\nname: "skill-lower"\ndescription: "Lower"\n---\n',
        );
        fs.writeFileSync(
          path.join(skill2Dir, "SKILL.md"),
          '---\nname: "skill-upper"\ndescription: "Upper"\n---\n',
        );
        fs.writeFileSync(
          path.join(skill3Dir, "Skill.md"),
          '---\nname: "skill-mixed"\ndescription: "Mixed"\n---\n',
        );

        const result = yield* discoverSkillsInDir(tempDir, Option.none(), defaultOptions);

        // Only exact "SKILL.md" should be recognized
        expect(result).toHaveLength(1);
        expect(result[0]?.skill.name).toBe("skill-upper");
      }),
    ),
  );

  it.effect("ignores non-SKILL.md files", () =>
    withFileSystem(
      Effect.gen(function* () {
        createSkillMd(path.join(tempDir, "my-skill"), "my-skill", "My skill");
        fs.writeFileSync(path.join(tempDir, "my-skill", "README.md"), "# Readme");
        fs.writeFileSync(path.join(tempDir, "my-skill", "other.txt"), "other");

        const result = yield* discoverSkillsInDir(tempDir, Option.none(), defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.skill.name).toBe("my-skill");
      }),
    ),
  );

  it.effect("fails with DiscoveryError for non-existent directory", () =>
    withFileSystem(
      Effect.gen(function* () {
        const nonExistentDir = path.join(tempDir, "does-not-exist");

        const error = yield* discoverSkillsInDir(
          nonExistentDir,
          Option.none(),
          defaultOptions,
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DiscoveryError);
        expect(error.message).toContain("does not exist");
      }),
    ),
  );

  it.effect("fails with DiscoveryError when path is a file, not a directory", () =>
    withFileSystem(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "not-a-directory.txt");
        fs.writeFileSync(filePath, "content");

        const error = yield* discoverSkillsInDir(filePath, Option.none(), defaultOptions).pipe(
          Effect.flip,
        );

        expect(error).toBeInstanceOf(DiscoveryError);
        expect(error.message).toContain("not a directory");
      }),
    ),
  );

  it.effect("skips inaccessible subdirectories gracefully", () =>
    withFileSystem(
      Effect.gen(function* () {
        createSkillMd(
          path.join(tempDir, "accessible-skill"),
          "accessible-skill",
          "Accessible skill",
        );

        const result = yield* discoverSkillsInDir(tempDir, Option.none(), defaultOptions);

        expect(result).toHaveLength(1);
        expect(result[0]?.skill.name).toBe("accessible-skill");
      }),
    ),
  );
});

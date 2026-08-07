/**
 * Unit tests for the 3-phase discovery algorithm in skillsInDir.
 *
 * Tests use real filesystem (temp directories) with @effect/platform-node.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { at } from "../../../test-helpers.js";
import { type DiscoveryOptions, getPriorityDirectories, skillsInDir } from "./skills.js";
import { AGENTS } from "../../../agents/registry.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const TestLayer = NodeServices.layer;

const withFileSystem = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  effect.pipe(Effect.provide(TestLayer));

/** Set INSTALL_INTERNAL_SKILLS env var for the duration of the effect. */
const withInstallInternalSkills = (value: string) => {
  return <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) => {
    const saved = process.env["INSTALL_INTERNAL_SKILLS"];
    process.env["INSTALL_INTERNAL_SKILLS"] = value;
    return effect.pipe(
      Effect.provide(TestLayer),
      Effect.ensuring(
        Effect.sync(() => {
          if (saved === undefined) delete process.env["INSTALL_INTERNAL_SKILLS"];
          else process.env["INSTALL_INTERNAL_SKILLS"] = saved;
        }),
      ),
    );
  };
};

/**
 * Create a SKILL.md with valid YAML frontmatter in a directory.
 */
const createSkillMd = (
  dir: string,
  name: string,
  description: string,
  metadata?: Record<string, string>,
) => {
  fs.mkdirSync(dir, { recursive: true });
  const metaStr = metadata
    ? `\nmetadata:\n${Object.entries(metadata)
        .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join("\n")}`
    : "";
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "${description}"${metaStr}\n---\n\n# ${name}\n`,
  );
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("skillsInDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "discover-skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const defaultOptions: DiscoveryOptions = {
    fullDepth: false,
    includeInternal: false,
  };

  // ===========================================================================
  // Phase 1 — Direct Match
  // ===========================================================================

  describe("Phase 1 — direct match", () => {
    it.effect("returns single skill and exits early when fullDepth is false", () =>
      withFileSystem(
        Effect.gen(function* () {
          const rootName = "root-skill";
          const searchRoot = path.join(tempDir, rootName);
          createSkillMd(searchRoot, rootName, "A root skill");

          const skills = yield* skillsInDir(searchRoot, Option.none(), {
            ...defaultOptions,
            fullDepth: false,
          });

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe(rootName);
          expect(at(skills, 0).skill.description).toBe("A root skill");
        }),
      ),
    );

    it.effect("continues to find more skills when fullDepth is true", () =>
      withFileSystem(
        Effect.gen(function* () {
          const rootName = "root-skill";
          const searchRoot = path.join(tempDir, rootName);
          createSkillMd(searchRoot, rootName, "A root skill");
          createSkillMd(path.join(searchRoot, "skills", "child-skill"), "child-skill", "A child");

          const skills = yield* skillsInDir(searchRoot, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          expect(skills.length).toBeGreaterThanOrEqual(2);
          const names = skills.map((s) => s.skill.name);
          expect(names).toContain(rootName);
          expect(names).toContain("child-skill");
        }),
      ),
    );

    it.effect("proceeds to Phase 2 when no SKILL.md at root", () =>
      withFileSystem(
        Effect.gen(function* () {
          // No SKILL.md at root, but one in a priority directory
          createSkillMd(path.join(tempDir, "skills", "my-skill"), "my-skill", "Found in phase 2");

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("my-skill");
        }),
      ),
    );
  });

  // ===========================================================================
  // Phase 2 — Priority Directory Scan
  // ===========================================================================

  describe("Phase 2 — priority directory scan", () => {
    it.effect("discovers skill in skills/ directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(path.join(tempDir, "skills", "my-skill"), "my-skill", "In skills dir");

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("my-skill");
        }),
      ),
    );

    it.effect("discovers skill in .claude/skills/ directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, ".claude", "skills", "claude-skill"),
            "claude-skill",
            "In claude skills",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("claude-skill");
        }),
      ),
    );

    it.effect("discovers skill in skills/.curated/ directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "skills", ".curated", "curated-skill"),
            "curated-skill",
            "A curated skill",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("curated-skill");
        }),
      ),
    );

    it.effect("silently skips missing priority directories", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Only create one priority dir with a skill; others don't exist
          createSkillMd(path.join(tempDir, "skills", "only-skill"), "only-skill", "The only skill");

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("only-skill");
        }),
      ),
    );

    it.effect("discovers top-level skill folders (. priority dir)", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Skill directly under search root (top-level folder)
          createSkillMd(
            path.join(tempDir, "top-level-skill"),
            "top-level-skill",
            "A top-level skill",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("top-level-skill");
        }),
      ),
    );

    it.effect("discovers skills across multiple priority directories", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(path.join(tempDir, "skills", "skill-a"), "skill-a", "From skills/");
          createSkillMd(
            path.join(tempDir, ".claude", "skills", "skill-b"),
            "skill-b",
            "From .claude/skills/",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(2);
          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("skill-a");
          expect(names).toContain("skill-b");
        }),
      ),
    );

    it.effect("discovers category-nested skills in canonical skills containers", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "skills", "quality", "quality-md"),
            "quality-md",
            "Nested under a category",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills.map((s) => s.skill.name)).toContain("quality-md");
        }),
      ),
    );

    it.effect("prefers canonical skills/ over agent skill-directory aliases", () =>
      withFileSystem(
        Effect.gen(function* () {
          const canonicalPath = path.join(tempDir, "skills", "quality");
          createSkillMd(canonicalPath, "quality", "Canonical skill");

          const agentSkillsDir = path.join(tempDir, ".agents", "skills");
          fs.mkdirSync(agentSkillsDir, { recursive: true });
          fs.symlinkSync(canonicalPath, path.join(agentSkillsDir, "quality"), "dir");

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          const matchingSkills = skills.filter((s) => s.skill.name === "quality");
          expect(matchingSkills).toHaveLength(1);
          expect(at(matchingSkills, 0).location).toBe(`file://${canonicalPath}`);
        }),
      ),
    );

    it.effect("does not descend below a discovered skill directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(path.join(tempDir, "skills", "outer"), "outer", "Outer skill");
          createSkillMd(
            path.join(tempDir, "skills", "outer", "inner"),
            "inner",
            "Nested inside a skill root",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("outer");
          expect(names).not.toContain("inner");
        }),
      ),
    );

    it.effect("does not discover example category skills when priority skills are present", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(path.join(tempDir, "skills", "real-skill"), "real-skill", "Real");
          createSkillMd(
            path.join(tempDir, "examples", "category", "demo"),
            "demo",
            "Example skill",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("real-skill");
          expect(names).not.toContain("demo");
        }),
      ),
    );
  });

  // ===========================================================================
  // Plugin Manifest Integration (Phase 2)
  // ===========================================================================

  describe("plugin manifest integration", () => {
    it.effect("discovers skills from marketplace.json-declared directories", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create plugin manifest pointing to a custom directory
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "marketplace.json"),
            JSON.stringify({
              plugins: [{ skillPath: "./custom-tools/my-tool" }],
            }),
          );

          // Create a skill in the manifest-declared directory
          createSkillMd(
            path.join(tempDir, "custom-tools", "my-tool"),
            "my-tool",
            "From marketplace manifest",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("my-tool");
        }),
      ),
    );

    it.effect("discovers skills from plugin.json-declared directories", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create plugin manifest
          const pluginDir = path.join(tempDir, ".claude-plugin");
          fs.mkdirSync(pluginDir, { recursive: true });
          fs.writeFileSync(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              skills: ["./extensions/my-extension"],
            }),
          );

          // Create a skill in the manifest-declared directory
          createSkillMd(
            path.join(tempDir, "extensions", "my-extension"),
            "my-extension",
            "From plugin manifest",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("my-extension");
        }),
      ),
    );

    it.effect("silently skips missing manifests during discovery", () =>
      withFileSystem(
        Effect.gen(function* () {
          // No .claude-plugin directory; skill in a priority dir
          createSkillMd(path.join(tempDir, "skills", "normal-skill"), "normal-skill", "Normal");

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("normal-skill");
        }),
      ),
    );
  });

  // ===========================================================================
  // Phase 3 — Recursive Fallback
  // ===========================================================================

  describe("Phase 3 — recursive fallback", () => {
    it.effect("triggers when no skills found in phases 1+2", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Skill in a non-priority, nested directory
          createSkillMd(
            path.join(tempDir, "custom", "nested", "deep-skill"),
            "deep-skill",
            "Found recursively",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("deep-skill");
        }),
      ),
    );

    it.effect("triggers when fullDepth is true even with phase 2 results", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "skills", "priority-skill"),
            "priority-skill",
            "From priority",
          );
          createSkillMd(
            path.join(tempDir, "custom", "nested", "deep-skill"),
            "deep-skill",
            "Found recursively",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("priority-skill");
          expect(names).toContain("deep-skill");
        }),
      ),
    );

    it.effect("does NOT find skills at depth > 5", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create a skill at depth 6 (beyond max depth of 5)
          const deepPath = path.join(tempDir, "a", "b", "c", "d", "e", "f", "too-deep-skill");
          createSkillMd(deepPath, "too-deep-skill", "Should not be found");

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("too-deep-skill");
        }),
      ),
    );

    it.effect("finds skills at exactly depth 5", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Depth 5 from search root: a/b/c/d/e/my-skill
          const deepPath = path.join(tempDir, "a", "b", "c", "d", "e", "depth5-skill");
          createSkillMd(deepPath, "depth5-skill", "At depth 5");

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("depth5-skill");
        }),
      ),
    );

    it.effect("skips node_modules directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "node_modules", "pkg", "hidden-skill"),
            "hidden-skill",
            "Should be skipped",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("hidden-skill");
        }),
      ),
    );

    it.effect("skips .git directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, ".git", "hooks", "git-skill"),
            "git-skill",
            "Should be skipped",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("git-skill");
        }),
      ),
    );

    it.effect("skips dist directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "dist", "dist-skill"),
            "dist-skill",
            "Should be skipped",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("dist-skill");
        }),
      ),
    );

    it.effect("skips build directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "build", "build-skill"),
            "build-skill",
            "Should be skipped",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("build-skill");
        }),
      ),
    );

    it.effect("skips __pycache__ directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "__pycache__", "py-skill"),
            "py-skill",
            "Should be skipped",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("py-skill");
        }),
      ),
    );

    it.effect("finds deep skill in non-priority nested directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "a", "b", "c", "my-skill"),
            "my-skill",
            "Deep nested skill",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("my-skill");
        }),
      ),
    );
  });

  // ===========================================================================
  // Deduplication
  // ===========================================================================

  describe("deduplication", () => {
    it.effect("deduplicates skills with the same name in different directories", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Same name in two priority directories
          createSkillMd(path.join(tempDir, "skills", "my-skill"), "my-skill", "From skills/ dir");
          createSkillMd(
            path.join(tempDir, ".claude", "skills", "my-skill"),
            "my-skill",
            "From .claude/skills/ dir",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          // Only one instance should be returned
          const matchingSkills = skills.filter((s) => s.skill.name === "my-skill");
          expect(matchingSkills).toHaveLength(1);
        }),
      ),
    );

    it.effect("priority directory version wins over recursive fallback", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Skill in priority dir (phase 2) and non-priority nested dir (phase 3)
          createSkillMd(path.join(tempDir, "skills", "dup-skill"), "dup-skill", "Priority version");
          createSkillMd(
            path.join(tempDir, "custom", "nested", "dup-skill"),
            "dup-skill",
            "Recursive version",
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            fullDepth: true,
          });

          const found = skills.filter((s) => s.skill.name === "dup-skill");
          expect(found).toHaveLength(1);
          // The priority directory version should win (discovered first in phase 2)
          expect(at(found, 0).skill.description).toBe("Priority version");
        }),
      ),
    );
  });

  // ===========================================================================
  // Internal Skill Filtering
  // ===========================================================================

  describe("internal skill filtering", () => {
    it.effect("excludes internal skills by default", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "skills", "internal-skill"),
            "internal-skill",
            "Secret",
            {
              internal: "true",
            },
          );
          createSkillMd(path.join(tempDir, "skills", "public-skill"), "public-skill", "Public");

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            includeInternal: false,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("internal-skill");
          expect(names).toContain("public-skill");
        }),
      ),
    );

    it.effect("includes internal skills when includeInternal is true", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "skills", "internal-skill"),
            "internal-skill",
            "Secret",
            {
              internal: "true",
            },
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            includeInternal: true,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("internal-skill");
        }),
      ),
    );

    it.effect("includes internal skills when INSTALL_INTERNAL_SKILLS=1", () =>
      withInstallInternalSkills("1")(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "skills", "internal-skill"),
            "internal-skill",
            "Secret",
            {
              internal: "true",
            },
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            includeInternal: false,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("internal-skill");
        }),
      ),
    );

    it.effect("includes internal skills when INSTALL_INTERNAL_SKILLS=true", () =>
      withInstallInternalSkills("true")(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "skills", "internal-skill"),
            "internal-skill",
            "Secret",
            {
              internal: "true",
            },
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            includeInternal: false,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("internal-skill");
        }),
      ),
    );

    it.effect("includes non-internal skills regardless of includeInternal setting", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(path.join(tempDir, "skills", "normal-skill"), "normal-skill", "Normal");

          const skills = yield* skillsInDir(tempDir, Option.none(), {
            ...defaultOptions,
            includeInternal: false,
          });

          const names = skills.map((s) => s.skill.name);
          expect(names).toContain("normal-skill");
        }),
      ),
    );
  });

  // ===========================================================================
  // subPath option
  // ===========================================================================

  describe("subPath option", () => {
    it.effect("uses subPath to compute search root", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(
            path.join(tempDir, "packages", "skills", "skills", "my-skill"),
            "my-skill",
            "In subpath",
          );

          const skills = yield* skillsInDir(
            tempDir,
            Option.some("packages/skills"),
            defaultOptions,
          );

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("my-skill");
        }),
      ),
    );
  });

  // ===========================================================================
  // Priority Directory Derivation
  // ===========================================================================

  describe("getPriorityDirectories", () => {
    it("starts with `.` then static dirs then agent dirs", () => {
      const dirs = getPriorityDirectories();

      // `.` is first (highest priority)
      expect(dirs[0]).toBe(".");

      // Static dirs follow
      const staticDirs = ["skills", "skills/.curated", "skills/.experimental", "skills/.system"];
      for (const staticDir of staticDirs) {
        expect(dirs).toContain(staticDir);
        expect(dirs.indexOf(staticDir)).toBeGreaterThan(0);
        expect(dirs.indexOf(staticDir)).toBeLessThan(1 + staticDirs.length);
      }

      // Agent dirs derived from registry
      const agents = Object.values(AGENTS);
      const uniqueAgentDirs = [...new Set(agents.map((a) => a.skills.dir))];
      for (const agentDir of uniqueAgentDirs) {
        expect(dirs).toContain(agentDir);
      }
      for (const readPath of agents.flatMap((agent) => agent.skills.additionalReadPaths)) {
        expect(dirs).toContain(readPath.path);
      }
    });

    it("does NOT contain stale .copilot/skills entry", () => {
      const dirs = getPriorityDirectories();
      expect(dirs).not.toContain(".copilot/skills");
    });

    it("deduplicates agent dirs that share the same skills.dir", () => {
      const dirs = getPriorityDirectories();

      // Multiple agents share `.agents/skills` (amp, kimi-cli, replit)
      // and `.trae/skills` (trae, trae-cn) — each should appear only once
      const agentSkillsCounts = dirs.reduce<Record<string, number>>((acc, dir) => {
        acc[dir] = (acc[dir] ?? 0) + 1;
        return acc;
      }, {});

      for (const count of Object.values(agentSkillsCounts)) {
        expect(count).toBe(1);
      }
    });
  });

  // ===========================================================================
  // Case-Sensitive SKILL.md Matching
  // ===========================================================================

  describe("case-sensitive SKILL.md matching", () => {
    it.effect("recognizes exact SKILL.md filename", () =>
      withFileSystem(
        Effect.gen(function* () {
          createSkillMd(path.join(tempDir, "skills", "exact-skill"), "exact-skill", "Exact match");

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(1);
          expect(at(skills, 0).skill.name).toBe("exact-skill");
        }),
      ),
    );

    it.effect("does NOT recognize skill.md (lowercase)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "skills", "lower-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(
            path.join(skillDir, "skill.md"),
            '---\nname: "lower-skill"\ndescription: "Lowercase"\n---\n',
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("lower-skill");
        }),
      ),
    );

    it.effect("does NOT recognize Skill.md (mixed case)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "skills", "mixed-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(
            path.join(skillDir, "Skill.md"),
            '---\nname: "mixed-skill"\ndescription: "Mixed case"\n---\n',
          );

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          const names = skills.map((s) => s.skill.name);
          expect(names).not.toContain("mixed-skill");
        }),
      ),
    );
  });

  // ===========================================================================
  // Empty results
  // ===========================================================================

  describe("empty results", () => {
    it.effect("returns empty array when no skills found", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Empty directory — no SKILL.md anywhere
          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(0);
        }),
      ),
    );

    it.effect("returns empty array when SKILL.md has invalid frontmatter", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create a SKILL.md without valid frontmatter
          const skillDir = path.join(tempDir, "skills", "bad-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# No frontmatter\n\nJust markdown.");

          const skills = yield* skillsInDir(tempDir, Option.none(), defaultOptions);

          expect(skills).toHaveLength(0);
        }),
      ),
    );
  });
});

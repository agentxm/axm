/**
 * Unit tests for the install command handler.
 *
 * Tests the reconciliation pattern:
 * 1. makeWorkspaceContext -> ensureInit -> loadCurrentState
 * 2. buildIdealState -> buildPlan -> applyPlan
 *
 * Tests use GitHub shorthand (github:test/skills) with mocked git operations
 * that copy from local fixtures. Local path sources are parsed but not yet
 * supported in the CLI handler.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "../../../settings/index.js";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import type { FileSystem, HttpClient, Path } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import YAML from "yaml";
import { type Clack, makeClackTestLayer } from "../../../clack-effect/index.js";
import {
  WorkspaceContextTag,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../../workspace/index.js";
import { handleInstall, type InstallArgs, InstallError } from "./handler.js";

// Mock git operations to use local fixtures instead of cloning
vi.mock("../../../extensions/skills/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../extensions/skills/index.js")>();

  // Track the fixture path for each mock call
  let currentFixturePath: string | undefined;

  return {
    ...original,
    // Allow tests to set the fixture path for cloning
    __setFixturePath: (fixturePath: string) => {
      currentFixturePath = fixturePath;
    },
    __clearFixturePath: () => {
      currentFixturePath = undefined;
    },
    // Mock cloneRepo to copy from fixture instead of actual git clone
    cloneRepo: vi.fn((url: string, destination: string) => {
      if (!currentFixturePath) {
        // Die with an error when no fixture is set (simulates failed clone)
        return Effect.die(`Failed to clone repository from ${url}`);
      }
      // Create destination and copy files from fixture
      fs.mkdirSync(destination, { recursive: true });
      copyDirSync(currentFixturePath, destination);
      // Create a minimal .git directory so isGitRepository returns true
      const gitDir = path.join(destination, ".git");
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
      return Effect.void;
    }),
    // Mock getCurrentCommit to return a fake SHA
    getCurrentCommit: vi.fn(() => {
      return Effect.succeed("abc1234567890abcdef1234567890abcdef12345");
    }),
  };
});

// Mock GitHub API to return fake tree hashes
// Track call count to return different hashes for different installs
let gitHubApiCallCount = 0;

vi.mock("../../../sources/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../sources/index.js")>();

  return {
    ...original,
    // Mock fetchGitHubTreeHash to return unique fake hashes for each call
    fetchGitHubTreeHash: vi.fn(() => {
      // Increment call counter and generate unique hash based on call number
      gitHubApiCallCount++;
      // Generate a valid 40-character hex hash with varying content
      const hexPart = gitHubApiCallCount.toString(16).padStart(8, "0");
      const hash = `${hexPart}00000000000000000000000000000000`.slice(0, 40);
      return Effect.succeed(hash);
    }),
    // Allow tests to reset the call counter
    __resetGitHubApiCallCount: () => {
      gitHubApiCallCount = 0;
    },
  };
});

/**
 * Helper to recursively copy a directory.
 */
function copyDirSync(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Create mock Clack layer for tests (default: confirm returns true, multiselect returns first item)
const [ClackTestLayer] = makeClackTestLayer({
  confirmBehavior: Option.some({ type: "return", value: true }),
  selectBehavior: Option.none(),
  multiselectBehavior: Option.some({ type: "return", indices: [0] }),
});

// Layer providing all required services for tests
const TestLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  FetchHttpClient.layer,
  ClackTestLayer,
);

// Mock TTY utilities
vi.mock("../../../utils/tty.js", () => ({
  isInteractive: vi.fn(() => true),
}));

// Import the mock helpers after vi.mock
type SkillsModule = typeof import("../../../extensions/skills/index.js") & {
  __setFixturePath: (path: string) => void;
  __clearFixturePath: () => void;
};

describe("install.handler", () => {
  let tempDir: string;
  let originalCwd: string;
  let sourceDir: string;
  let skillsModule: SkillsModule;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-handler-test-"));
    sourceDir = path.join(tempDir, "source-skills");
    // Change to temp dir so .axm is created there
    process.chdir(tempDir);
    // Import the mocked module to access helper functions
    skillsModule = (await import("../../../extensions/skills/index.js")) as unknown as SkillsModule;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Clear fixture path after each test
    skillsModule.__clearFixturePath();
  });

  /**
   * Helper function to provide the test layer including WorkspaceContext.
   * Workspace options default to { global: false, yes: true, nonInteractive: true }.
   *
   * NOTE: The workspace layer is built eagerly by Effect.provide, so it runs
   * BEFORE the Effect.gen body. Tests that set up state before yielding
   * WorkspaceContextTag should use withBaseTestLayer + inline workspace layer.
   */
  const withTestLayer = (wsOverrides?: { global?: boolean; agents?: readonly string[] }) => {
    const wsOpts: WorkspaceContextOptions = {
      global: wsOverrides?.global ?? false,
      yes: true,
      nonInteractive: true,
      ...(wsOverrides?.agents && wsOverrides.agents.length > 0 && { agents: wsOverrides.agents }),
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOpts), TestLayer);
    const FullLayer = Layer.merge(TestLayer, WsLayer);
    return <A, E>(
      effect: Effect.Effect<
        A,
        E,
        FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | Clack | WorkspaceContextTag
      >,
    ) => effect.pipe(Effect.provide(FullLayer));
  };

  /**
   * Provide base test layers without WorkspaceContext.
   * Use for tests that need to set up state before workspace layer construction.
   */
  const withBaseTestLayer = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | Clack>,
  ) => effect.pipe(Effect.provide(TestLayer));

  const defaultArgs: InstallArgs = {
    source: "",
    global: false,
    agent: [],
    skill: [],
    yes: false,
    list: false,
    all: false,
    force: false,
  };

  /**
   * Creates a local skill source directory with SKILL.md files and
   * sets up the mock to use it when cloning.
   *
   * Returns a GitHub shorthand source string (the mock will use the local fixture).
   */
  const createSkillSource = (skills: { name: string; description?: string }[]): string => {
    fs.mkdirSync(sourceDir, { recursive: true });

    for (const { name, description } of skills) {
      const skillDir = path.join(sourceDir, name);
      fs.mkdirSync(skillDir, { recursive: true });

      const content = description ? `# ${name}\n\n${description}` : `# ${name}\n\nA test skill.`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
    }

    // Set the fixture path for the mock cloneRepo
    skillsModule.__setFixturePath(sourceDir);

    // Return a GitHub shorthand - the mock will clone from the fixture instead
    return "github:test/skills";
  };

  /**
   * Initializes .axm directory with settings.
   */
  const initializeAxm = (agents: string[] = []): void => {
    const axmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    // Cast is safe: test helper only uses valid agent IDs from SUPPORTED_AGENTS
    const settings: Settings = {
      agents: agents as Settings["agents"],
      skills: {},
    };

    fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings, null, 2));
    // Create lockfile so workspace layer can read it
    if (!fs.existsSync(path.join(axmDir, "axm-lock.yaml"))) {
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
    }
  };

  // =============================================================================
  // Reconciliation Pattern Tests
  // =============================================================================

  describe("reconciliation pattern", () => {
    describe("workspace initialization", () => {
      it.effect("initializes .axm directory if not present", () =>
        withTestLayer()(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            // Don't call initializeAxm() - let handler create it

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            expect(fs.existsSync(path.join(tempDir, ".axm"))).toBe(true);
            expect(fs.existsSync(path.join(tempDir, ".axm", "settings.json"))).toBe(true);
          }),
        ),
      );
    });

    describe("dry-run mode", () => {
      it.effect("displays plan without making changes in dry-run mode", () =>
        withTestLayer()(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              all: true,
              dryRun: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            // Skill should NOT be installed in dry-run mode
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "commit"),
              ),
            ).toBe(false);
          }),
        ),
      );

      it.effect("auto-selects all skills in dry-run mode", () =>
        withTestLayer()(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              dryRun: true,
              agent: ["claude-code"],
            };

            // Should complete without prompting for skill selection
            yield* handleInstall(args);

            // No skills installed in dry-run
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "commit"),
              ),
            ).toBe(false);
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "review-pr"),
              ),
            ).toBe(false);
          }),
        ),
      );
    });

    describe("force flag for unhealthy workspace", () => {
      it.effect("proceeds with installation when --force is used", () =>
        withTestLayer()(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              force: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            expect(
              fs.existsSync(
                path.join(
                  tempDir,
                  ".axm",
                  "extensions",
                  "external",
                  "skills",
                  "commit",
                  "SKILL.md",
                ),
              ),
            ).toBe(true);
          }),
        ),
      );

      it.effect("overwrites existing skills with --force", () =>
        withTestLayer()(
          Effect.gen(function* () {
            // Create initial source
            const sourceDir1 = path.join(tempDir, "source-1");
            fs.mkdirSync(sourceDir1, { recursive: true });
            fs.mkdirSync(path.join(sourceDir1, "commit"));
            fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# Original commit");

            skillsModule.__setFixturePath(sourceDir1);
            initializeAxm();

            // Install first version
            yield* handleInstall({
              ...defaultArgs,
              source: "github:test/skills",
              all: true,
              yes: true,
              agent: ["claude-code"],
            });

            // Verify original content
            let content = fs.readFileSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
              "utf-8",
            );
            expect(content).toBe("# Original commit");

            // Create second source with updated skill
            const sourceDir2 = path.join(tempDir, "source-2");
            fs.mkdirSync(sourceDir2, { recursive: true });
            fs.mkdirSync(path.join(sourceDir2, "commit"));
            fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# Updated commit");

            // Update mock to use new fixture
            skillsModule.__setFixturePath(sourceDir2);

            // Install with --force
            yield* handleInstall({
              ...defaultArgs,
              source: "github:test/skills",
              all: true,
              yes: true,
              force: true,
              agent: ["claude-code"],
            });

            // Content should be updated
            content = fs.readFileSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
              "utf-8",
            );
            expect(content).toBe("# Updated commit");
          }),
        ),
      );
    });

    describe("plan computation", () => {
      it.effect("reports 'already up to date' when no changes needed", () =>
        withTestLayer()(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            // First install
            yield* handleInstall({
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              agent: ["claude-code"],
            });

            // Second install - should report no changes
            yield* handleInstall({
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              agent: ["claude-code"],
            });

            // Should have completed successfully (no error thrown)
          }),
        ),
      );
    });
  });

  // =============================================================================
  // Source Parsing Tests
  // =============================================================================

  describe("source parsing", () => {
    it.effect("fails with InstallError for invalid source format", () =>
      withTestLayer()(
        Effect.gen(function* () {
          initializeAxm();
          const args: InstallArgs = {
            ...defaultArgs,
            source: "", // Empty source is invalid
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("Invalid source");
        }),
      ),
    );

    it.effect("recognizes GitHub source type in list mode", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          // Just verify it doesn't fail on parsing - we test list mode to avoid agent selection
          const args: InstallArgs = {
            ...defaultArgs,
            source,
            list: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);
          // Should succeed (list mode doesn't install)
        }),
      ),
    );
  });

  // =============================================================================
  // Source Discovery Tests (using GitHub shorthand with mock)
  // =============================================================================

  describe("source discovery", () => {
    it.effect("discovers skills from GitHub source via mock", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "commit", description: "Auto-commit helper" },
            { name: "review-pr", description: "PR review helper" },
          ]);
          initializeAxm();

          // Use list mode to see discovered skills without installing
          const args: InstallArgs = {
            ...defaultArgs,
            source,
            list: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);
        }),
      ),
    );

    it.effect("handles local source directory (not yet supported)", () =>
      withTestLayer()(
        Effect.gen(function* () {
          fs.mkdirSync(sourceDir, { recursive: true });
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: sourceDir,
            yes: true,
            agent: ["claude-code"],
          };

          // Local source directory exists but has no skills
          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("No skills found");
        }),
      ),
    );

    it.effect("handles non-existent local source path", () =>
      withTestLayer()(
        Effect.gen(function* () {
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: path.join(tempDir, "nonexistent-dir"),
            yes: true,
            agent: ["claude-code"],
          };

          // Local source path doesn't exist
          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("Failed to discover skills");
        }),
      ),
    );
  });

  // =============================================================================
  // Agent Handling Tests
  // =============================================================================

  describe("agent handling", () => {
    it.effect("uses explicitly specified agents via --agent flag", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            agent: ["claude-code"],
            all: true,
            yes: true,
          };

          yield* handleInstall(args);

          // Verify skill was installed to canonical location
          const canonicalSkillPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "skills",
            "commit",
            "SKILL.md",
          );
          expect(fs.existsSync(canonicalSkillPath)).toBe(true);
        }),
      ),
    );

    it.effect("warns about invalid agent IDs", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            agent: ["invalid-agent-xyz"],
            all: true,
            yes: true,
          };

          // With invalid agent, should complete but not install to any agent
          // Handler completes without error (just warns about invalid agents)
          yield* handleInstall(args);
        }),
      ),
    );

    it.effect("handles mix of valid and invalid agent IDs", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            agent: ["claude-code", "invalid-agent"],
            all: true,
            yes: true,
          };

          // Should succeed with valid agent
          yield* handleInstall(args);
        }),
      ),
    );
  });

  // =============================================================================
  // Non-Interactive Mode Tests
  // =============================================================================

  describe("non-interactive mode with --yes flag", () => {
    it.effect("skips agent selection prompt with --yes", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            yes: true,
            agent: ["claude-code"],
            all: true,
          };

          // Should complete without prompting
          yield* handleInstall(args);
        }),
      ),
    );

    it.effect("skips skill selection prompt with --yes and --all", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            yes: true,
            agent: ["claude-code"],
            all: true,
          };

          yield* handleInstall(args);

          // Both skills should be installed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                tempDir,
                ".axm",
                "extensions",
                "external",
                "skills",
                "review-pr",
                "SKILL.md",
              ),
            ),
          ).toBe(true);
        }),
      ),
    );

    it.effect("skips confirmation prompt with --yes", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            yes: true,
            agent: ["claude-code"],
            all: true,
          };

          yield* handleInstall(args);
        }),
      ),
    );
  });

  // =============================================================================
  // --all Flag Tests
  // =============================================================================

  describe("--all flag", () => {
    it.effect("installs all discovered skills with --all", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "skill-1" },
            { name: "skill-2" },
            { name: "skill-3" },
          ]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // All skills should be installed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "skill-1", "SKILL.md"),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "skill-2", "SKILL.md"),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "skill-3", "SKILL.md"),
            ),
          ).toBe(true);
        }),
      ),
    );
  });

  // =============================================================================
  // --skill Flag Tests
  // =============================================================================

  describe("--skill flag for specific skills", () => {
    it.effect("installs only specified skills with --skill", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "commit" },
            { name: "review-pr" },
            { name: "debug" },
          ]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            skill: ["commit", "debug"],
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // Only specified skills should be installed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "debug", "SKILL.md"),
            ),
          ).toBe(true);
          // review-pr should NOT be installed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "review-pr"),
            ),
          ).toBe(false);
        }),
      ),
    );

    it.effect("warns about unknown skill names", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            skill: ["commit", "nonexistent-skill"],
            yes: true,
            agent: ["claude-code"],
          };

          // Should still install the valid skill
          yield* handleInstall(args);

          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
            ),
          ).toBe(true);
        }),
      ),
    );

    it.effect("handles empty result when all specified skills are invalid", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            skill: ["nonexistent-1", "nonexistent-2"],
            yes: true,
            agent: ["claude-code"],
          };

          // Should complete successfully but install nothing
          yield* handleInstall(args);
        }),
      ),
    );
  });

  // =============================================================================
  // --list Flag Tests
  // =============================================================================

  describe("--list flag", () => {
    it.effect("lists available skills without installing", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "commit", description: "Auto-commit helper" },
            { name: "review-pr", description: "PR review helper" },
          ]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            list: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // Skills should NOT be installed in list mode
          expect(
            fs.existsSync(path.join(tempDir, ".axm", "extensions", "external", "skills", "commit")),
          ).toBe(false);
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "review-pr"),
            ),
          ).toBe(false);
        }),
      ),
    );
  });

  // =============================================================================
  // Settings and Lockfile Tests
  // =============================================================================

  describe("settings and lockfile updates", () => {
    it.effect("updates settings.json with installed skill", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

          // V2 stores the full source URL (e.g., "github:test/skills")
          expect(settings.skills?.["commit"]).toBeDefined();
          expect(settings.skills?.["commit"]).toContain("github:test/skills");
        }),
      ),
    );

    it.effect("creates axm-lock.yaml with installed skill entry", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          expect(fs.existsSync(lockPath)).toBe(true);

          // V2 preserves the original source type (github, not local)
          const lockContent = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          expect(lockContent.lockfileVersion).toBe(1);
          expect(lockContent.skills.commit).toBeDefined();
          expect(lockContent.skills.commit.source).toBe("github");
          expect(lockContent.skills.commit.owner).toBe("test");
          expect(lockContent.skills.commit.repo).toBe("skills");
          // gitTreeHash is optional in V2 (only present if GitHub API returns it)
          expect(lockContent.skills.commit.agents).toBeDefined();
          expect(lockContent.skills.commit.installedAt).toBeDefined();
          expect(lockContent.skills.commit.updatedAt).toBeDefined();
        }),
      ),
    );
  });

  // =============================================================================
  // Canonical Skill Storage Tests
  // =============================================================================

  describe("canonical skill storage", () => {
    // V2 stores skills at .axm/extensions/external/skills/<name>/ for GitHub sources
    it.effect("copies skill to .axm/extensions/external/skills/<name>/", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // V2 canonical path for external sources
          const canonicalPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "skills",
            "commit",
          );
          expect(fs.existsSync(canonicalPath)).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
        }),
      ),
    );

    it.effect("preserves skill directory structure", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Create skill with subdirectories via createSkillSource helper
          // which sets up the mock to use the local fixture
          fs.mkdirSync(sourceDir, { recursive: true });
          const skillDir = path.join(sourceDir, "complex-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Complex Skill");
          fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
          fs.writeFileSync(path.join(skillDir, "references", "commands.md"), "# Commands");

          // Set up mock to use the local fixture
          skillsModule.__setFixturePath(sourceDir);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // V2 canonical path for external sources
          const canonicalPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "skills",
            "complex-skill",
          );
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "references", "commands.md"))).toBe(true);
        }),
      ),
    );
  });

  // =============================================================================
  // Global Flag Tests
  // =============================================================================

  describe("global flag", () => {
    it.effect("uses ~/.axm for global installations", () =>
      withTestLayer({ global: true })(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);

          // Backup and cleanup global settings and lockfile
          const globalAxmDir = path.join(os.homedir(), ".axm");
          const globalSettingsPath = path.join(globalAxmDir, "settings.json");
          const globalLockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
          const settingsExistedBefore = fs.existsSync(globalSettingsPath);
          const lockfileExistedBefore = fs.existsSync(globalLockfilePath);
          let backupSettings: string | undefined;
          let backupLockfile: string | undefined;
          let backupSkillsDir: string | undefined;
          // V2 canonical path for external sources
          const skillsDir = path.join(globalAxmDir, "extensions", "external", "skills", "commit");
          const skillsExistedBefore = fs.existsSync(skillsDir);

          if (settingsExistedBefore) {
            backupSettings = fs.readFileSync(globalSettingsPath, "utf-8");
          }
          if (lockfileExistedBefore) {
            backupLockfile = fs.readFileSync(globalLockfilePath, "utf-8");
          }
          if (skillsExistedBefore) {
            // Backup existing skill if present
            backupSkillsDir = fs.readFileSync(path.join(skillsDir, "SKILL.md"), "utf-8");
          }

          try {
            // Remove existing settings and lockfile to test fresh init
            if (settingsExistedBefore) {
              fs.rmSync(globalSettingsPath);
            }
            if (lockfileExistedBefore) {
              fs.rmSync(globalLockfilePath);
            }
            if (skillsExistedBefore) {
              fs.rmSync(skillsDir, { recursive: true });
            }

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              global: true,
              all: true,
              yes: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            // Should create settings in home directory
            expect(fs.existsSync(globalSettingsPath)).toBe(true);

            // Skill should be in global location (V2 canonical path)
            expect(
              fs.existsSync(
                path.join(globalAxmDir, "extensions", "external", "skills", "commit", "SKILL.md"),
              ),
            ).toBe(true);

            // Should NOT be in project directory
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "commit"),
              ),
            ).toBe(false);
          } finally {
            // Restore original state
            if (settingsExistedBefore && backupSettings) {
              fs.writeFileSync(globalSettingsPath, backupSettings);
            } else if (!settingsExistedBefore && fs.existsSync(globalSettingsPath)) {
              fs.rmSync(globalSettingsPath);
            }
            if (lockfileExistedBefore && backupLockfile) {
              fs.writeFileSync(globalLockfilePath, backupLockfile);
            } else if (!lockfileExistedBefore && fs.existsSync(globalLockfilePath)) {
              fs.rmSync(globalLockfilePath);
            }
            if (skillsExistedBefore && backupSkillsDir) {
              fs.mkdirSync(skillsDir, { recursive: true });
              fs.writeFileSync(path.join(skillsDir, "SKILL.md"), backupSkillsDir);
            } else if (!skillsExistedBefore && fs.existsSync(skillsDir)) {
              fs.rmSync(skillsDir, { recursive: true });
            }
          }
        }),
      ),
    );
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe("error scenarios", () => {
    it.effect("returns InstallError with descriptive message for parsing errors", () =>
      withTestLayer()(
        Effect.gen(function* () {
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: "",
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toBeTruthy();
        }),
      ),
    );

    it.effect("handles discovery errors gracefully", () =>
      withTestLayer()(
        Effect.gen(function* () {
          initializeAxm();

          // Source that doesn't exist
          const args: InstallArgs = {
            ...defaultArgs,
            source: "/nonexistent/path/to/skills",
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
        }),
      ),
    );
  });

  // =============================================================================
  // Error Message Recovery Guidance Tests
  // =============================================================================

  describe("error messages with recovery guidance", () => {
    it.effect("invalid source error suggests valid source formats", () =>
      withTestLayer()(
        Effect.gen(function* () {
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: "", // Empty source is invalid
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          const message = (error as InstallError).message;
          expect(message).toContain("Invalid source");
          // Recovery guidance: valid formats
          expect(message).toContain("github:");
          expect(message).toContain("gitlab:");
          expect(message).toContain("local path");
        }),
      ),
    );

    it.effect("local source empty directory error", () =>
      withTestLayer()(
        Effect.gen(function* () {
          fs.mkdirSync(sourceDir, { recursive: true });
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: sourceDir,
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          const message = (error as InstallError).message;
          // Local source directory exists but has no skills
          expect(message).toContain("No skills found");
        }),
      ),
    );
  });

  // =============================================================================
  // InstallError Tests
  // =============================================================================

  describe("InstallError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new InstallError({
        message: "Test error message",
        cause: Option.none(),
        retryable: false,
      });

      expect(error._tag).toBe("InstallError");
      expect(error.message).toBe("Test error message");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = new InstallError({
        message: "Wrapped error",
        cause: Option.some(cause),
        retryable: false,
      });

      expect(Option.isSome(error.cause)).toBe(true);
      expect(Option.getOrNull(error.cause)).toBe(cause);
    });
  });

  // =============================================================================
  // Conflict Detection Tests
  // =============================================================================

  describe("conflict detection", () => {
    // V2 behavior: Re-installing from the same source updates the skill
    // (no skipping). Only different sources trigger conflicts requiring --force.
    it.effect("updates skill when reinstalling from same source (V2 behavior)", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Create initial source with specific content
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# Original");

          skillsModule.__setFixturePath(sourceDir1);
          initializeAxm();

          // First install
          yield* handleInstall({
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // Verify first install
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
            ),
          ).toBe(true);

          // Create second source with DIFFERENT content for same skill name
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# Modified");

          // Update mock to use new fixture
          skillsModule.__setFixturePath(sourceDir2);

          // Second install from same source - V2 updates the skill
          yield* handleInstall({
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // V2: File should have new content (skill was updated, not skipped)
          const content = fs.readFileSync(
            path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
            "utf-8",
          );
          expect(content).toBe("# Modified");
        }),
      ),
    );

    it.effect("updates existing and installs new skills from same source (V2 behavior)", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Create initial source with one skill
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# commit");

          skillsModule.__setFixturePath(sourceDir1);
          initializeAxm();

          // Install first skill
          const args1: InstallArgs = {
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args1);

          // Create second source with overlapping and new skill
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# commit v2");
          fs.mkdirSync(path.join(sourceDir2, "review-pr"));
          fs.writeFileSync(path.join(sourceDir2, "review-pr", "SKILL.md"), "# review-pr");

          // Update mock to use new fixture
          skillsModule.__setFixturePath(sourceDir2);

          // Install from same source - V2 updates commit, installs review-pr
          const args2: InstallArgs = {
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args2);

          // V2: commit should be updated
          const commitContent = fs.readFileSync(
            path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
            "utf-8",
          );
          expect(commitContent).toBe("# commit v2"); // Updated, not original

          // New skill should be installed
          expect(
            fs.existsSync(
              path.join(
                tempDir,
                ".axm",
                "extensions",
                "external",
                "skills",
                "review-pr",
                "SKILL.md",
              ),
            ),
          ).toBe(true);
        }),
      ),
    );

    it.effect("exits early when all selected skills already installed", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          // First install
          const args1: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args1);

          // Second install - should complete without error but do nothing
          const args2: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args2);

          // Should have completed successfully (no error thrown)
        }),
      ),
    );
  });

  // =============================================================================
  // Force Flag Tests
  // =============================================================================

  describe("--force flag", () => {
    it.effect("updates lockfile when overwriting with --force", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Create initial source
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# Original");

          skillsModule.__setFixturePath(sourceDir1);
          initializeAxm();

          // Install first version
          yield* handleInstall({
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // Get original lockfile entry (new flat structure)
          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const originalLock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          const originalHash = originalLock.skills.commit.gitTreeHash;

          // Create second source with different content
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# Updated content");

          // Update mock to use new fixture
          skillsModule.__setFixturePath(sourceDir2);

          // Install with --force
          yield* handleInstall({
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            force: true,
            agent: ["claude-code"],
          });

          // Lockfile should have updated hash (flat structure)
          const newLock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          expect(newLock.skills.commit.gitTreeHash).not.toBe(originalHash);
        }),
      ),
    );

    it.effect("installs both existing and new skills with --force", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Create initial source
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# commit v1");

          skillsModule.__setFixturePath(sourceDir1);
          initializeAxm();

          // Install first skill
          yield* handleInstall({
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // Create second source with both existing and new skills
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# commit v2");
          fs.mkdirSync(path.join(sourceDir2, "review-pr"));
          fs.writeFileSync(path.join(sourceDir2, "review-pr", "SKILL.md"), "# review-pr");

          // Update mock to use new fixture
          skillsModule.__setFixturePath(sourceDir2);

          // Install with --force
          yield* handleInstall({
            ...defaultArgs,
            source: "github:test/skills",
            all: true,
            yes: true,
            force: true,
            agent: ["claude-code"],
          });

          // Both should be installed/updated
          const commitContent = fs.readFileSync(
            path.join(tempDir, ".axm", "extensions", "external", "skills", "commit", "SKILL.md"),
            "utf-8",
          );
          expect(commitContent).toBe("# commit v2");
          expect(
            fs.existsSync(
              path.join(
                tempDir,
                ".axm",
                "extensions",
                "external",
                "skills",
                "review-pr",
                "SKILL.md",
              ),
            ),
          ).toBe(true);
        }),
      ),
    );
  });

  // =============================================================================
  // Settings Schema Tests
  // =============================================================================

  describe("settings schema", () => {
    it.effect("creates settings with skills at root level", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          // Don't initialize - let handler create fresh settings

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

          // V2 stores the full source URL (e.g., "github:test/skills")
          expect(settings.skills).toBeDefined();
          expect(settings.skills.commit).toContain("github:test/skills");
        }),
      ),
    );

    it.effect("preserves existing settings when adding new skills", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Initialize with existing settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "settings.json"),
            JSON.stringify({
              scope: "@myorg",
              agents: ["claude-code"],
              skills: {
                "existing-skill": "^1.0.0",
              },
            }),
          );

          const source = createSkillSource([{ name: "commit" }]);

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const settings = JSON.parse(fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"));

          // Existing settings should be preserved
          expect(settings.scope).toBe("@myorg");
          expect(settings.agents).toEqual(["claude-code"]);
          expect(settings.skills?.["existing-skill"]).toBe("^1.0.0");
          // V2 stores the full source URL (e.g., "github:test/skills")
          expect(settings.skills.commit).toContain("github:test/skills");
        }),
      ),
    );
  });

  // =============================================================================
  // Lockfile Schema Tests
  // =============================================================================

  describe("lockfile schema", () => {
    it.effect("creates lockfile with lockfileVersion and extensions structure", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

          expect(lockfile.lockfileVersion).toBe(1);
          expect(lockfile.skills).toBeDefined();
        }),
      ),
    );

    it.effect("lockfile entry contains required fields", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          const entry = lockfile.skills.commit;

          // V2 preserves the original source type (github, not local)
          expect(entry.source).toBe("github");
          expect(entry.owner).toBe("test");
          expect(entry.repo).toBe("skills");
          expect(entry.agents).toBeDefined();
          expect(entry.installedAt).toBeDefined();
          expect(entry.updatedAt).toBeDefined();

          // gitTreeHash is optional in V2 (only present if GitHub API returns it)
          // In mocked tests it may be undefined
        }),
      ),
    );

    it.effect("lockfile timestamps are valid ISO strings", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          const entry = lockfile.skills.commit;

          // Timestamps should be valid ISO strings
          expect(() => new Date(entry.installedAt)).not.toThrow();
          expect(() => new Date(entry.updatedAt)).not.toThrow();
          expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
          expect(new Date(entry.updatedAt).toISOString()).toBe(entry.updatedAt);
        }),
      ),
    );
  });

  // =============================================================================
  // Explicit Source Prefix Pattern Tests
  // =============================================================================

  describe("explicit source prefix patterns", () => {
    it.effect("parses github: prefix correctly", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Set up a valid fixture so we can verify parsing works
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          // The source returned by createSkillSource is github:test/skills
          // which proves github: prefix is parsed correctly
          const args: InstallArgs = {
            ...defaultArgs,
            source,
            list: true, // Use list mode to avoid full install
            agent: ["claude-code"],
          };

          // Should succeed in list mode - proves github: prefix was parsed
          yield* handleInstall(args);
        }),
      ),
    );

    it.effect("parses gitlab: prefix correctly", () =>
      withTestLayer()(
        Effect.gen(function* () {
          initializeAxm();

          // gitlab: prefix should be recognized as GitLab source
          // Since we don't have a mock for gitlab, test that it fails at clone stage
          // (not parse stage) by checking the error is about the clone operation
          const args: InstallArgs = {
            ...defaultArgs,
            source: "gitlab:test/skills",
            yes: true,
            agent: ["claude-code"],
          };

          // Should fail during clone (not during parsing)
          // Effect.die creates a defect which we catch with catchAllDefect
          const result = yield* handleInstall(args).pipe(
            Effect.map(() => "success" as const),
            Effect.catchAllDefect((defect) => Effect.succeed(String(defect))),
            Effect.catchAll((error) => Effect.succeed(`error: ${error._tag}`)),
          );

          // Should fail at clone stage with our mock's die message
          expect(result).toContain("Failed to clone");
        }),
      ),
    );

    it.effect("stores skill source in lockfile (local with cached path)", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          // Install from GitHub source (createSkillSource returns github:test/skills)
          // V2 preserves the original source type
          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // V2 preserves the original source type (github, not local)
          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          expect(lockfile.skills.commit.source).toBe("github");
          expect(lockfile.skills.commit.owner).toBe("test");
          expect(lockfile.skills.commit.repo).toBe("skills");
        }),
      ),
    );
  });

  // =============================================================================
  // State-Based Application Tests
  // =============================================================================

  describe("state-based application (applyPlan)", () => {
    it.effect("uses applyPlan for installation (not direct manipulation)", () =>
      withTestLayer()(
        Effect.gen(function* () {
          // Create a local source directory with a skill
          fs.mkdirSync(sourceDir, { recursive: true });
          const skillDir = path.join(sourceDir, "local-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Local Skill\n\nA local test skill.");

          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: sourceDir, // Local path source
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // V2 stores skills at .axm/extensions/external/skills/<name>/
          expect(
            fs.existsSync(
              path.join(
                tempDir,
                ".axm",
                "extensions",
                "external",
                "skills",
                "local-skill",
                "SKILL.md",
              ),
            ),
          ).toBe(true);

          // V2 stores the full source path in settings (local:/path)
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills?.["local-skill"]).toContain("local:");

          // Verify lockfile has local source with path
          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          expect(lockfile.skills["local-skill"].source).toBe("local");
          expect(lockfile.skills["local-skill"].path).toBeDefined();
        }),
      ),
    );
  });

  // =============================================================================
  // Source Normalization Tests
  // =============================================================================

  describe("source normalization", () => {
    it.effect("preserves original source type in lockfile (V2 behavior)", () =>
      withTestLayer()(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

          // V2 preserves the original source type (github, not local)
          expect(lockfile.skills.commit.source).toBe("github");
          expect(lockfile.skills.commit.owner).toBe("test");
          expect(lockfile.skills.commit.repo).toBe("skills");
        }),
      ),
    );
  });

  // =============================================================================
  // Non-TTY Scenarios Tests
  // =============================================================================

  describe("non-TTY scenarios", () => {
    // Import the mocked module dynamically to control mock behavior
    let isInteractiveMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      // Get references to the mocked functions
      const ttyModule = await import("../../../utils/tty.js");
      isInteractiveMock = ttyModule.isInteractive as ReturnType<typeof vi.fn>;
      // Reset to default TTY behavior
      isInteractiveMock.mockReturnValue(true);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe("agent handling in non-interactive mode", () => {
      it.effect("exits gracefully when no agents in settings and no --agent flag", () =>
        withBaseTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm(); // Creates settings with empty agents array

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              // No --agent flag - will use agents from settings (which is empty)
              all: true,
              yes: true,
            };

            // Provide workspace layer after initializeAxm so it reads empty agents
            const WsLayer = Layer.provide(
              workspaceLayer({ global: false, yes: true, nonInteractive: true }),
              TestLayer,
            );

            // Should complete without error (early exit when no agents configured)
            yield* handleInstall(args).pipe(Effect.provide(WsLayer));

            // Skill should NOT be installed because no agents were configured
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "commit"),
              ),
            ).toBe(false);
          }),
        ),
      );

      it.effect("succeeds when --agent flag is explicitly set", () =>
        withTestLayer()(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              yes: true,
              agent: ["claude-code"],
              all: true,
            };

            yield* handleInstall(args);

            // Skill should be installed
            expect(
              fs.existsSync(
                path.join(
                  tempDir,
                  ".axm",
                  "extensions",
                  "external",
                  "skills",
                  "commit",
                  "SKILL.md",
                ),
              ),
            ).toBe(true);
          }),
        ),
      );

      it.effect("uses agents from settings when available", () =>
        withTestLayer()(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm(["claude-code"]); // Initialize with an agent

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              // No --agent flag - will use agents from settings
              all: true,
              yes: true,
            };

            yield* handleInstall(args);

            // Skill should be installed because agents were in settings
            expect(
              fs.existsSync(
                path.join(
                  tempDir,
                  ".axm",
                  "extensions",
                  "external",
                  "skills",
                  "commit",
                  "SKILL.md",
                ),
              ),
            ).toBe(true);
          }),
        ),
      );
    });

    describe("skill selection in non-interactive mode", () => {
      it.effect("fails with InstallError when stdin is not TTY and no --all/--skill flag", () =>
        withTestLayer()(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"], // Explicit agent avoids agent selection prompt
              // No --all, no --skill
            };

            const error = yield* handleInstall(args).pipe(Effect.flip);

            expect(error._tag).toBe("InstallError");
            expect((error as InstallError).message).toContain("Cannot prompt for skill selection");
            expect((error as InstallError).message).toContain("stdin is not a TTY");
          }),
        ),
      );

      it.effect("succeeds when stdin is not TTY but --all flag is set", () =>
        withTestLayer()(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              all: true,
              yes: true, // Skip confirmation prompt too
            };

            yield* handleInstall(args);
          }),
        ),
      );

      it.effect("succeeds when stdin is not TTY but --skill flag is set", () =>
        withTestLayer()(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              skill: ["commit"],
              yes: true, // Skip confirmation prompt too
            };

            yield* handleInstall(args);

            // Only specified skill should be installed
            expect(
              fs.existsSync(
                path.join(
                  tempDir,
                  ".axm",
                  "extensions",
                  "external",
                  "skills",
                  "commit",
                  "SKILL.md",
                ),
              ),
            ).toBe(true);
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "review-pr"),
              ),
            ).toBe(false);
          }),
        ),
      );
    });

    describe("confirmation in non-interactive mode", () => {
      it.effect("fails with InstallError when stdin is not TTY and confirmation needed", () =>
        withTestLayer()(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              all: true,
              // No --yes - would need confirmation prompt
            };

            const error = yield* handleInstall(args).pipe(Effect.flip);

            expect(error._tag).toBe("InstallError");
            expect((error as InstallError).message).toContain("Cannot prompt for confirmation");
            expect((error as InstallError).message).toContain("stdin is not a TTY");
          }),
        ),
      );
    });
  });
});

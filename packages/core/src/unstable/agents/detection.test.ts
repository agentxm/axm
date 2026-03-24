/**
 * Tests for agent detection functions.
 *
 * Detection is effectful and uses FileSystem service. Tests use mocked
 * FileSystem to control which paths appear to exist.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AppError } from "../app-error/index.js";
import { detectAgent, detectAgents } from "./detection.js";
import { AGENTS } from "./registry.js";

/** Resolve home dir for use in test path construction. */
const home = os.homedir();

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock FileSystem layer where `exists` returns true for specified paths.
 * Merges with NodePath.layer to provide Path.Path.
 */
const createMockFileSystem = (existingPaths: Set<string>) =>
  Layer.merge(
    Layer.succeed(FileSystem.FileSystem, {
      exists: (p: string) => Effect.succeed(existingPaths.has(p)),
      // Other methods are not used by detectAgent/detectAgents
    } as unknown as FileSystem.FileSystem),
    NodePath.layer,
  );

/**
 * Creates a mock FileSystem layer where `exists` always fails with an error.
 * Merges with NodePath.layer to provide Path.Path.
 */
const createFailingFileSystem = (errorMessage: string) =>
  Layer.merge(
    Layer.succeed(FileSystem.FileSystem, {
      exists: () =>
        Effect.fail(
          new PlatformError.SystemError({
            _tag: "Unknown",
            module: "FileSystem",
            method: "exists",
            description: errorMessage,
          }),
        ),
    } as unknown as FileSystem.FileSystem),
    NodePath.layer,
  );

/**
 * Provides real filesystem and path for live tests.
 */
const withRealFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** A temporary directory path used as projectDir in tests. */
const testProjectDir = "/tmp/test-project";

// =============================================================================
// detectAgent Tests
// =============================================================================

describe("detectAgent", () => {
  describe("project-level detection (skills.dir first segment in project dir)", () => {
    it.effect("detects claude-code when .claude/ exists in project dir", () =>
      Effect.gen(function* () {
        // claude-code has skills.dir: ".claude/skills", first segment: ".claude"
        const projectPath = path.join(testProjectDir, ".claude");
        const existingPaths = new Set([projectPath]);
        const result = yield* detectAgent(AGENTS["claude-code"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects cursor when .cursor/ exists in project dir", () =>
      Effect.gen(function* () {
        const projectPath = path.join(testProjectDir, ".cursor");
        const existingPaths = new Set([projectPath]);
        const result = yield* detectAgent(AGENTS["cursor"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects amp when .agents/ exists in project dir", () =>
      Effect.gen(function* () {
        // amp has skills.dir: ".agents/skills", first segment: ".agents"
        const projectPath = path.join(testProjectDir, ".agents");
        const existingPaths = new Set([projectPath]);
        const result = yield* detectAgent(AGENTS["amp"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );
  });

  describe("global detection (~/.{agent-id})", () => {
    it.effect("detects claude-code when ~/.claude-code exists", () =>
      Effect.gen(function* () {
        const globalPath = path.join(home, ".claude-code");
        const existingPaths = new Set([globalPath]);
        const result = yield* detectAgent(AGENTS["claude-code"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects cursor when ~/.cursor exists", () =>
      Effect.gen(function* () {
        const globalPath = path.join(home, ".cursor");
        const existingPaths = new Set([globalPath]);
        const result = yield* detectAgent(AGENTS["cursor"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects cline when ~/.cline exists", () =>
      Effect.gen(function* () {
        const globalPath = path.join(home, ".cline");
        const existingPaths = new Set([globalPath]);
        const result = yield* detectAgent(AGENTS["cline"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );
  });

  describe("combined OR logic", () => {
    it.effect("detects when both project-level and global paths exist", () =>
      Effect.gen(function* () {
        const projectPath = path.join(testProjectDir, ".claude");
        const globalPath = path.join(home, ".claude-code");
        const existingPaths = new Set([projectPath, globalPath]);
        const result = yield* detectAgent(AGENTS["claude-code"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects when only project-level path exists (no global)", () =>
      Effect.gen(function* () {
        const projectPath = path.join(testProjectDir, ".cursor");
        const existingPaths = new Set([projectPath]);
        const result = yield* detectAgent(AGENTS["cursor"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects when only global path exists (no project-level)", () =>
      Effect.gen(function* () {
        const globalPath = path.join(home, ".cursor");
        const existingPaths = new Set([globalPath]);
        const result = yield* detectAgent(AGENTS["cursor"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("returns false when neither path exists", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["cursor"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );
  });

  describe("shared skills.dir detecting multiple agents", () => {
    it.effect("detects all agents sharing .agents/ when .agents/ exists in project", () =>
      Effect.gen(function* () {
        // amp, kimi-cli, replit all use ".agents/skills"
        const projectPath = path.join(testProjectDir, ".agents");
        const existingPaths = new Set([projectPath]);

        const [ampResult, kimiResult, replitResult] = yield* Effect.all(
          [
            detectAgent(AGENTS["amp"], testProjectDir),
            detectAgent(AGENTS["kimi-cli"], testProjectDir),
            detectAgent(AGENTS["replit"], testProjectDir),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.provide(createMockFileSystem(existingPaths)));

        expect(ampResult).toBe(true);
        expect(kimiResult).toBe(true);
        expect(replitResult).toBe(true);
      }),
    );
  });

  describe("returns false when agent's detection paths don't exist", () => {
    it.effect("returns false for claude-code when no paths exist", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["claude-code"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for codex when no paths exist", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["codex"], testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );
  });

  describe("handles filesystem errors", () => {
    it.effect("wraps filesystem error in AppError", () =>
      Effect.gen(function* () {
        const error = yield* detectAgent(AGENTS["claude-code"], testProjectDir).pipe(
          Effect.provide(createFailingFileSystem("Permission denied")),
          Effect.flip,
        );
        expect(error).toBeInstanceOf(AppError);
        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("AGENT_DETECTION_FAILED");
        expect(error.what).toContain("Claude Code");
      }),
    );

    it.effect("preserves original error as cause", () =>
      Effect.gen(function* () {
        const error = yield* detectAgent(AGENTS["cursor"], testProjectDir).pipe(
          Effect.provide(createFailingFileSystem("I/O error")),
          Effect.flip,
        );
        expect(error.cause).toBeDefined();
        expect((error.cause as PlatformError.SystemError).message).toContain("I/O error");
      }),
    );
  });
});

// =============================================================================
// detectAgents Tests
// =============================================================================

describe("detectAgents", () => {
  describe("returns array of detected agents", () => {
    it.effect("returns empty array when no agents are detected", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgents(testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      }),
    );

    it.effect("returns single agent when only one is detected", () =>
      Effect.gen(function* () {
        // Use project-level detection for claude-code
        const existingPaths = new Set([path.join(testProjectDir, ".claude")]);
        const result = yield* detectAgents(testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result.length).toBe(1);
        expect(result[0]?.id).toBe("claude-code");
      }),
    );

    it.effect("returns multiple agents when several are detected", () =>
      Effect.gen(function* () {
        const existingPaths = new Set([
          path.join(testProjectDir, ".claude"),
          path.join(home, ".cursor"),
          path.join(home, ".continue"),
        ]);
        const result = yield* detectAgents(testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result.length).toBeGreaterThanOrEqual(3);
        const ids = result.map((a) => a.id);
        expect(ids).toContain("claude-code");
        expect(ids).toContain("cursor");
        expect(ids).toContain("continue");
      }),
    );

    it.effect("returns only AgentDescriptor objects from AGENTS registry", () =>
      Effect.gen(function* () {
        const existingPaths = new Set([
          path.join(testProjectDir, ".claude"),
          path.join(home, ".codex"),
        ]);
        const result = yield* detectAgents(testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );

        for (const agent of result) {
          expect(AGENTS[agent.id]).toBe(agent);
        }
      }),
    );
  });

  describe("runs detection concurrently", () => {
    it.effect("completes detection for all agents in reasonable time", () =>
      withRealFileSystem(
        Effect.gen(function* () {
          const startTime = Date.now();
          const result = yield* detectAgents(testProjectDir);
          const elapsed = Date.now() - startTime;

          // With 40+ agents, sequential execution would be slow
          // Concurrent execution should complete in under 5 seconds
          expect(elapsed).toBeLessThan(5000);
          expect(Array.isArray(result)).toBe(true);
        }),
      ),
    );

    it.effect("returns no duplicates", () =>
      Effect.gen(function* () {
        const existingPaths = new Set([
          path.join(testProjectDir, ".claude"),
          path.join(home, ".cursor"),
          path.join(home, ".codex"),
        ]);
        const result = yield* detectAgents(testProjectDir).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );

        const ids = result.map((a) => a.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }),
    );
  });

  describe("handles errors gracefully", () => {
    it.effect("fails with AppError when filesystem fails", () =>
      Effect.gen(function* () {
        const error = yield* detectAgents(testProjectDir).pipe(
          Effect.provide(createFailingFileSystem("Disk error")),
          Effect.flip,
        );
        expect(error).toBeInstanceOf(AppError);
        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("AGENT_DETECTION_FAILED");
      }),
    );
  });
});

// =============================================================================
// AppError from detection Tests
// =============================================================================

describe("AppError from detection", () => {
  it.effect("detectAgent produces AppError with AGENT_DETECTION_FAILED code on failure", () =>
    Effect.gen(function* () {
      const error = yield* detectAgent(AGENTS["claude-code"], testProjectDir).pipe(
        Effect.provide(createFailingFileSystem("test error")),
        Effect.flip,
      );
      expect(error._tag).toBe("AppError");
      expect(error.code).toBe("AGENT_DETECTION_FAILED");
    }),
  );
});

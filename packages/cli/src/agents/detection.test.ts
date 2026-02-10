/**
 * Tests for agent detection functions.
 *
 * Detection is effectful and uses FileSystem service. Tests use mocked
 * FileSystem to control which paths appear to exist.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as path from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as PlatformError from "@effect/platform/Error";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { claudeHome } from "./claude-code/index.js";
import { codexHome } from "./codex/index.js";
import { configHome, home } from "./constants.js";
import { DetectionError, detectAgent, detectAgents } from "./detection.js";
import { AGENTS } from "./registry.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock FileSystem layer where `exists` returns true for specified paths.
 */
const createMockFileSystem = (existingPaths: Set<string>) =>
  Layer.succeed(FileSystem.FileSystem, {
    exists: (p: string) => Effect.succeed(existingPaths.has(p)),
    // Other methods are not used by detectAgent/detectAgents
  } as unknown as FileSystem.FileSystem);

/**
 * Creates a mock FileSystem layer where `exists` always fails with an error.
 */
const createFailingFileSystem = (errorMessage: string) =>
  Layer.succeed(FileSystem.FileSystem, {
    exists: () =>
      Effect.fail(
        new PlatformError.SystemError({
          reason: "Unknown",
          module: "FileSystem",
          method: "exists",
          description: errorMessage,
        }),
      ),
  } as unknown as FileSystem.FileSystem);

/**
 * Provides real filesystem for live tests.
 */
const withRealFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeFileSystem.layer));

// =============================================================================
// detectAgent Tests
// =============================================================================

describe("detectAgent", () => {
  describe("returns true when agent's detection path exists", () => {
    it.effect("detects claude-code when claudeHome exists", () =>
      Effect.gen(function* () {
        const existingPaths = new Set([claudeHome]);
        const result = yield* detectAgent(AGENTS["claude-code"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects cursor when ~/.cursor exists", () =>
      Effect.gen(function* () {
        const cursorPath = path.join(home, ".cursor");
        const existingPaths = new Set([cursorPath]);
        const result = yield* detectAgent(AGENTS["cursor"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects codex when codexHome exists", () =>
      Effect.gen(function* () {
        const existingPaths = new Set([codexHome]);
        const result = yield* detectAgent(AGENTS["codex"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects codex when /etc/codex exists (alternative path)", () =>
      Effect.gen(function* () {
        const existingPaths = new Set(["/etc/codex"]);
        const result = yield* detectAgent(AGENTS["codex"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects opencode when configHome/opencode exists", () =>
      Effect.gen(function* () {
        const opencodePath = path.join(configHome, "opencode");
        const existingPaths = new Set([opencodePath]);
        const result = yield* detectAgent(AGENTS["opencode"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects windsurf when ~/.codeium exists", () =>
      Effect.gen(function* () {
        const windsurfPath = path.join(home, ".codeium");
        const existingPaths = new Set([windsurfPath]);
        const result = yield* detectAgent(AGENTS["windsurf"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("detects continue when ~/.continue exists", () =>
      Effect.gen(function* () {
        const continuePath = path.join(home, ".continue");
        const existingPaths = new Set([continuePath]);
        const result = yield* detectAgent(AGENTS["continue"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );
  });

  describe("returns false when agent's detection path doesn't exist", () => {
    it.effect("returns false for claude-code when claudeHome doesn't exist", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["claude-code"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for cursor when ~/.cursor doesn't exist", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["cursor"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for codex when neither path exists", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["codex"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for opencode when configHome/opencode doesn't exist", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["opencode"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for windsurf when ~/.codeium doesn't exist", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["windsurf"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for continue when ~/.continue doesn't exist", () =>
      Effect.gen(function* () {
        const existingPaths = new Set<string>();
        const result = yield* detectAgent(AGENTS["continue"]).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
      }),
    );
  });

  describe("handles filesystem errors", () => {
    it.effect("wraps filesystem error in DetectionError", () =>
      Effect.gen(function* () {
        const error = yield* detectAgent(AGENTS["claude-code"]).pipe(
          Effect.provide(createFailingFileSystem("Permission denied")),
          Effect.flip,
        );
        expect(error).toBeInstanceOf(DetectionError);
        expect(error._tag).toBe("DetectionError");
        expect(error.message).toContain("Claude Code");
      }),
    );

    it.effect("preserves original error as cause", () =>
      Effect.gen(function* () {
        const error = yield* detectAgent(AGENTS["cursor"]).pipe(
          Effect.provide(createFailingFileSystem("I/O error")),
          Effect.flip,
        );
        expect(error.cause).toBeDefined();
        expect((error.cause as PlatformError.SystemError).message).toContain("I/O error");
      }),
    );
  });

  describe("default case for agents without specific detection logic", () => {
    it.effect("uses heuristic detection for unknown agent patterns", () =>
      Effect.gen(function* () {
        // Agents without explicit case in switch use the default heuristic
        // which checks ~/.{agent-id} or the first segment of projectDir
        const clineAgent = AGENTS["cline"];
        const clineHomePath = path.join(home, ".cline");
        const existingPaths = new Set([clineHomePath]);

        const result = yield* detectAgent(clineAgent).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(true);
      }),
    );

    it.effect("returns false when heuristic paths don't exist", () =>
      Effect.gen(function* () {
        const rooAgent = AGENTS["roo"];
        const existingPaths = new Set<string>();

        const result = yield* detectAgent(rooAgent).pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result).toBe(false);
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
        const result = yield* detectAgents().pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      }),
    );

    it.effect("returns single agent when only one is detected", () =>
      Effect.gen(function* () {
        const existingPaths = new Set([claudeHome]);
        const result = yield* detectAgents().pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );
        expect(result.length).toBe(1);
        expect(result[0]?.id).toBe("claude-code");
      }),
    );

    it.effect("returns multiple agents when several are detected", () =>
      Effect.gen(function* () {
        const existingPaths = new Set([
          claudeHome,
          path.join(home, ".cursor"),
          path.join(home, ".continue"),
        ]);
        const result = yield* detectAgents().pipe(
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
        const existingPaths = new Set([claudeHome, codexHome]);
        const result = yield* detectAgents().pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );

        for (const agent of result) {
          // Each returned agent should be the exact object from registry
          expect(AGENTS[agent.id]).toBe(agent);
        }
      }),
    );
  });

  describe("runs detection concurrently", () => {
    it.effect("completes detection for all agents in reasonable time", () =>
      withRealFileSystem(
        Effect.gen(function* () {
          // This test uses real filesystem and verifies concurrency
          // by checking the function completes quickly despite many agents
          const startTime = Date.now();
          const result = yield* detectAgents();
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
        const existingPaths = new Set([claudeHome, path.join(home, ".cursor"), codexHome]);
        const result = yield* detectAgents().pipe(
          Effect.provide(createMockFileSystem(existingPaths)),
        );

        const ids = result.map((a) => a.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }),
    );
  });

  describe("handles errors gracefully", () => {
    it.effect("fails with DetectionError when filesystem fails", () =>
      Effect.gen(function* () {
        const error = yield* detectAgents().pipe(
          Effect.provide(createFailingFileSystem("Disk error")),
          Effect.flip,
        );
        expect(error).toBeInstanceOf(DetectionError);
        expect(error._tag).toBe("DetectionError");
      }),
    );
  });
});

// =============================================================================
// DetectionError Tests
// =============================================================================

describe("DetectionError", () => {
  it("is properly typed as TaggedError", () => {
    const error = new DetectionError({ message: "test error" });
    expect(error._tag).toBe("DetectionError");
  });

  it("can be instantiated with message only", () => {
    const error = new DetectionError({ message: "Agent not found" });
    expect(error.message).toBe("Agent not found");
    expect(error.cause).toBeUndefined();
  });

  it("can include cause for error chaining", () => {
    const cause = new Error("Original filesystem error");
    const error = new DetectionError({
      message: "Detection failed",
      cause,
    });
    expect(error.message).toBe("Detection failed");
    expect(error.cause).toBe(cause);
  });

  it("extends Data.TaggedError for proper Effect error handling", () => {
    const error = new DetectionError({ message: "test" });

    // TaggedError should be yieldable in Effect - fail with it and verify propagation
    const effect = Effect.fail(error);

    // Verify the error propagates correctly
    const flipped = Effect.flip(effect);
    const result = Effect.runSync(flipped);
    expect(result).toBe(error);
  });
});

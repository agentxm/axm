/**
 * Tests for structured agent detection.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AppError } from "../app-error/index.js";
import { expectDefined } from "../test-helpers.js";
import {
  AgentExecutableResolver,
  detectAgent,
  detectAgentInRoot,
  detectAgents,
  detectAgentsInRoot,
} from "./detection.js";
import { AGENTS } from "./registry.js";
import type { AgentDescriptor } from "./types.js";

const home = os.homedir();
const testProjectDir = "/tmp/test-project";

const createMockFileSystem = (existingPaths: Set<string>) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      return {
        ...fileSystem,
        exists: (target: string) => Effect.succeed(existingPaths.has(target)),
      } satisfies FileSystem.FileSystem;
    }),
  ).pipe(Layer.provideMerge(NodeServices.layer));

const createFailingFileSystem = (errorMessage: string) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      return {
        ...fileSystem,
        exists: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "Unknown",
              module: "FileSystem",
              method: "exists",
              description: errorMessage,
            }),
          ),
      } satisfies FileSystem.FileSystem;
    }),
  ).pipe(Layer.provideMerge(NodeServices.layer));

const createExecutableResolver = (available: Set<string>) =>
  Layer.succeed(AgentExecutableResolver, {
    exists: (name: string) => Effect.succeed(available.has(name)),
  });

const provideDetectionLayer = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  existingPaths: Set<string>,
  executables: Set<string> = new Set(),
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(createMockFileSystem(existingPaths), createExecutableResolver(executables)),
    ),
  );

const syntheticAgent = (detection: AgentDescriptor["detection"]): AgentDescriptor => ({
  id: "codex",
  name: "Synthetic Agent",
  skills: { dir: ".agents/skills" },
  detection,
});

describe("detectAgent", () => {
  it.effect("detects a definitive project directory marker", () =>
    Effect.gen(function* () {
      const result = yield* provideDetectionLayer(
        detectAgent(AGENTS["claude-code"], testProjectDir),
        new Set([path.join(testProjectDir, ".claude")]),
      );

      expect(result).toBe(true);
    }),
  );

  it.effect("detects a definitive project file marker", () =>
    Effect.gen(function* () {
      const agent = syntheticAgent({
        project: {
          markers: [
            { kind: "file", path: ".sample/config.json", signal: "definitive", note: null },
          ],
        },
        user: { markers: [] },
      });

      const result = yield* provideDetectionLayer(
        detectAgent(agent, testProjectDir),
        new Set([path.join(testProjectDir, ".sample/config.json")]),
      );

      expect(result).toBe(true);
    }),
  );

  it.effect("requires two corroborating supporting or ambiguous markers", () =>
    Effect.gen(function* () {
      const agent = syntheticAgent({
        project: {
          markers: [
            { kind: "file", path: "AGENTS.md", signal: "ambiguous", note: null },
            { kind: "file", path: ".sample/config.json", signal: "supporting", note: null },
          ],
        },
        user: { markers: [] },
      });

      const oneMarker = yield* provideDetectionLayer(
        detectAgent(agent, testProjectDir),
        new Set([path.join(testProjectDir, "AGENTS.md")]),
      );
      const twoMarkers = yield* provideDetectionLayer(
        detectAgent(agent, testProjectDir),
        new Set([
          path.join(testProjectDir, "AGENTS.md"),
          path.join(testProjectDir, ".sample/config.json"),
        ]),
      );

      expect(oneMarker).toBe(false);
      expect(twoMarkers).toBe(true);
    }),
  );

  it.effect("does not detect Codex from shared AGENTS.md alone", () =>
    Effect.gen(function* () {
      const result = yield* provideDetectionLayer(
        detectAgent(AGENTS["codex"], testProjectDir),
        new Set([path.join(testProjectDir, "AGENTS.md")]),
      );

      expect(result).toBe(false);
    }),
  );

  it.effect("detects an executable marker through the injectable resolver", () =>
    Effect.gen(function* () {
      const result = yield* provideDetectionLayer(
        detectAgent(AGENTS["codex"], testProjectDir),
        new Set(),
        new Set(["codex"]),
      );

      expect(result).toBe(true);
    }),
  );

  it.effect("resolves user-scope markers against home and XDG config home", () =>
    Effect.gen(function* () {
      const agent = syntheticAgent({
        project: { markers: [] },
        user: {
          markers: [
            { kind: "dir", path: "~/.sample", signal: "supporting", note: null },
            {
              kind: "file",
              path: "$XDG_CONFIG_HOME/sample/config.json",
              signal: "supporting",
              note: null,
            },
          ],
        },
      });
      const configHome = process.env["XDG_CONFIG_HOME"] ?? path.join(home, ".config");

      const result = yield* provideDetectionLayer(
        detectAgent(agent, testProjectDir),
        new Set([path.join(home, ".sample"), path.join(configHome, "sample/config.json")]),
      );

      expect(result).toBe(true);
    }),
  );

  it.effect("wraps filesystem errors in AppError", () =>
    Effect.gen(function* () {
      const error = yield* detectAgent(AGENTS["claude-code"], testProjectDir).pipe(
        Effect.provide(
          Layer.mergeAll(
            createFailingFileSystem("Permission denied"),
            createExecutableResolver(new Set()),
          ),
        ),
        Effect.flip,
      );

      expect(error).toBeInstanceOf(AppError);
      expect(error._tag).toBe("AppError");
      expect(error.code).toBe("internal");
      expect(error.detail).toContain("Claude Code");
      const cause = expectDefined(error.cause, "Expected original cause");
      expect(cause).toBeInstanceOf(PlatformError.PlatformError);
    }),
  );
});

describe("detectAgentInRoot", () => {
  it.effect("checks project-scope markers in the supplied root only", () =>
    Effect.gen(function* () {
      const result = yield* provideDetectionLayer(
        detectAgentInRoot(AGENTS["cursor"], testProjectDir),
        new Set([path.join(testProjectDir, ".cursor")]),
      );

      expect(result).toBe(true);
    }),
  );
});

describe("detectAgents", () => {
  it.effect("returns detected registry agents without duplicates", () =>
    Effect.gen(function* () {
      const result = yield* provideDetectionLayer(
        detectAgents(testProjectDir),
        new Set([path.join(testProjectDir, ".claude"), path.join(home, ".cursor")]),
      );

      const ids = result.map((agent) => agent.id);
      expect(ids).toContain("claude-code");
      expect(ids).toContain("cursor");
      expect(new Set(ids).size).toBe(ids.length);
    }),
  );

  it.effect("returns an empty array when no agents are detected", () =>
    Effect.gen(function* () {
      const result = yield* provideDetectionLayer(detectAgents(testProjectDir), new Set());

      expect(result).toEqual([]);
    }),
  );
});

describe("detectAgentsInRoot", () => {
  it.effect("returns agents detected from project-scope markers", () =>
    Effect.gen(function* () {
      const result = yield* provideDetectionLayer(
        detectAgentsInRoot(testProjectDir),
        new Set([path.join(testProjectDir, ".codex"), path.join(testProjectDir, ".roo")]),
      );
      const ids = result.map((agent) => agent.id);

      expect(ids).toContain("codex");
      expect(ids).toContain("roo");
    }),
  );
});

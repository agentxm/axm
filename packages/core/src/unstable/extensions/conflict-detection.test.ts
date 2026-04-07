/**
 * Unit tests for conflict detection utilities.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { detectConflict } from "./conflict-detection.js";
import { generateMarker } from "./managed-marker.js";

/**
 * Creates a mock FileSystem that returns specified content for readFileString
 * or fails with a not-found error.
 */
const createMockFileSystem = (files: Record<string, string>) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      return {
        ...fileSystem,
        readFileString: (path: string) => {
          if (path in files) {
            return Effect.succeed(files[path] as string);
          }
          return Effect.fail(
            PlatformError.systemError({
              _tag: "NotFound",
              module: "FileSystem",
              method: "readFileString",
              description: `File not found: ${path}`,
              pathOrDescriptor: path,
            }),
          );
        },
      } satisfies FileSystem.FileSystem;
    }),
  ).pipe(Layer.provideMerge(NodeServices.layer));

/**
 * Creates a mock FileSystem that always fails with a permission error.
 */
const createPermissionErrorFileSystem = () =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      return {
        ...fileSystem,
        readFileString: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "Unknown",
              module: "FileSystem",
              method: "readFileString",
              description: "Permission denied",
            }),
          ),
      } satisfies FileSystem.FileSystem;
    }),
  ).pipe(Layer.provideMerge(NodeServices.layer));

describe("detectConflict", () => {
  it.effect("returns Absent when file does not exist", () =>
    Effect.gen(function* () {
      const result = yield* detectConflict("/nonexistent/file.md").pipe(
        Effect.provide(createMockFileSystem({})),
      );
      expect(result._tag).toBe("Absent");
    }),
  );

  it.effect("returns Owned when file starts with a managed marker", () =>
    Effect.gen(function* () {
      const marker = generateMarker("skill", "markdown");
      const content = `${marker}\n# My Skill\n\nSome content.`;
      const result = yield* detectConflict("/project/.claude/skills/my-skill.md").pipe(
        Effect.provide(createMockFileSystem({ "/project/.claude/skills/my-skill.md": content })),
      );
      expect(result._tag).toBe("Owned");
    }),
  );

  it.effect("returns Conflict when file exists without managed marker", () =>
    Effect.gen(function* () {
      const content = "# My Custom File\n\nUser-written content.";
      const result = yield* detectConflict("/project/.claude/skills/my-skill.md").pipe(
        Effect.provide(createMockFileSystem({ "/project/.claude/skills/my-skill.md": content })),
      );
      expect(result._tag).toBe("Conflict");
    }),
  );

  it.effect("uses provided fileContent instead of reading from disk", () =>
    Effect.gen(function* () {
      const marker = generateMarker("command", "markdown");
      const content = `${marker}\n# My Command`;
      // Pass content directly — should not read from filesystem
      const result = yield* detectConflict("/any/path.md", content).pipe(
        Effect.provide(createMockFileSystem({})),
      );
      expect(result._tag).toBe("Owned");
    }),
  );

  it.effect("returns Conflict for provided fileContent without marker", () =>
    Effect.gen(function* () {
      const content = "User content without marker";
      const result = yield* detectConflict("/any/path.md", content).pipe(
        Effect.provide(createMockFileSystem({})),
      );
      expect(result._tag).toBe("Conflict");
    }),
  );

  it.effect("returns AppError on permission errors", () =>
    Effect.gen(function* () {
      const exit = yield* detectConflict("/restricted/file.md").pipe(
        Effect.provide(createPermissionErrorFileSystem()),
        Effect.exit,
      );
      expect(exit._tag).toBe("Failure");
    }),
  );

  it.effect("returns data only — no policy decisions", () =>
    Effect.gen(function* () {
      const marker = generateMarker("skill", "text");
      const content = `${marker}\nbody`;
      const result = yield* detectConflict("/some/file.txt", content).pipe(
        Effect.provide(createMockFileSystem({})),
      );
      // Result is a plain data object with a _tag, no side effects
      expect(["Absent", "Owned", "Conflict"]).toContain(result._tag);
    }),
  );
});

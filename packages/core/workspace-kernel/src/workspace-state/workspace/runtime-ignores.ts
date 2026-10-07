/** Runtime files are never shared workspace authority. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { writeFileAtomic } from "@agentxm/host-primitives";
import { protectWorkspacePath, recordFootprint } from "../../settlement/index.js";
import { RuntimeIgnoreWriteError } from "./errors.js";

export const ensureWorkspaceTransientIgnores = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const filePath = path.join(workspaceRoot, ".gitignore");
    const exists = yield* fs
      .exists(filePath)
      .pipe(
        Effect.mapError(
          (cause) => new RuntimeIgnoreWriteError({ path: filePath, step: "check-target", cause }),
        ),
      );
    const current = yield* fs.readFileString(filePath).pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound" ? Effect.succeed("") : Effect.fail(error),
      ),
      Effect.mapError(
        (cause) => new RuntimeIgnoreWriteError({ path: filePath, step: "read-target", cause }),
      ),
    );
    const newline = current.includes("\r\n") ? "\r\n" : current.includes("\r") ? "\r" : "\n";
    const lines = new Set(current.split(/\r\n|\r|\n/u));
    const missing = ["/.axm/", "*.axm-staging/", "*.axm-backup/"].filter(
      (line) => !lines.has(line),
    );
    if (missing.length === 0) return;
    const prefix = current.length === 0 || /[\r\n]$/u.test(current) ? current : current + newline;
    yield* protectWorkspacePath(filePath);
    yield* writeFileAtomic(fs, {
      targetPath: filePath,
      content: prefix + missing.join(newline) + newline,
      mapError: ({ step, cause }) => new RuntimeIgnoreWriteError({ path: filePath, step, cause }),
    });
    yield* recordFootprint({ path: filePath, change: exists ? "modified" : "created" });
  });

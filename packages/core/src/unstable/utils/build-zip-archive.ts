/**
 * Build a deterministic zip archive of a directory.
 *
 * Uses node:child_process and node:fs directly because this operation
 * requires the system `zip` and `find` commands for deterministic archives.
 * This is an intentional escape hatch from @effect/platform.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";

/**
 * Check that a required system binary exists on PATH.
 */
const requireBinary = (name: string, _errorCode: string) =>
  Effect.tryPromise({
    try: async () => {
      const { execFileSync } = await import("node:child_process");
      execFileSync("which", [name], { stdio: "pipe" });
    },
    catch: () =>
      makeAppError({
        code: "internal",
        message: `Required system command "${name}" not found`,
        breadcrumbs: [
          {
            description: `Install "${name}" and ensure it is available on your PATH.`,
          },
        ],
      }),
  });

/**
 * Build a zip archive of a directory.
 * Files are stored at the root of the zip (no enclosing directory).
 *
 * Copies the source directory to a temporary location before normalizing
 * timestamps, so the original directory is never mutated.
 */
export const buildZipArchive = (dir: string, errorCode: string) =>
  Effect.gen(function* () {
    yield* requireBinary("find", errorCode);
    yield* requireBinary("zip", errorCode);

    return yield* Effect.tryPromise({
      try: async () => {
        const { execFileSync } = await import("node:child_process");
        const { readFile, mkdtemp, rm, cp } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const p = await import("node:path");

        const tmpDir = await mkdtemp(p.join(tmpdir(), "axm-publish-"));
        const copyDir = p.join(tmpDir, "content");
        const archivePath = p.join(tmpDir, "archive.zip");

        // Copy source to temp directory to avoid mutating original timestamps
        await cp(dir, copyDir, { recursive: true });

        // Create deterministic zip (strip extra attributes, normalize timestamps)
        // -X strips extra file attributes, -D disables directory entries
        // find + touch normalizes file timestamps for reproducible archives
        execFileSync("find", [copyDir, "-exec", "touch", "-t", "202001010000.00", "{}", "+"]);
        execFileSync("zip", ["-r", "-q", "-X", "-D", archivePath, "."], {
          cwd: copyDir,
          stdio: "pipe",
        });

        const bytes = await readFile(archivePath);
        await rm(tmpDir, { recursive: true, force: true });

        return new Uint8Array(bytes);
      },
      catch: (e) =>
        makeAppError({
          code: "internal",
          message: "Failed to build zip archive",
          cause: e,
        }),
    });
  });

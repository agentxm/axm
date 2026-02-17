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
import { makeCliError } from "../cli-error/index.js";

/**
 * Build a zip archive of a directory.
 * Files are stored at the root of the zip (no enclosing directory).
 */
export const buildZipArchive = (dir: string, errorCode: string) =>
  Effect.tryPromise({
    try: async () => {
      const { execFileSync } = await import("node:child_process");
      const { readFile, mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const p = await import("node:path");

      const tmpDir = await mkdtemp(p.join(tmpdir(), "axm-publish-"));
      const archivePath = p.join(tmpDir, "archive.zip");

      // Create deterministic zip (strip extra attributes, normalize timestamps)
      // -X strips extra file attributes, -D disables directory entries
      // find + touch normalizes file timestamps for reproducible archives
      execFileSync("find", [dir, "-exec", "touch", "-t", "202001010000.00", "{}", "+"]);
      execFileSync("zip", ["-r", "-q", "-X", "-D", archivePath, "."], {
        cwd: dir,
        stdio: "pipe",
      });

      const bytes = await readFile(archivePath);
      await rm(tmpDir, { recursive: true, force: true });

      return new Uint8Array(bytes);
    },
    catch: (e) =>
      makeCliError({
        code: errorCode,
        what: "Failed to build zip archive",
        cause: e,
      }),
  });

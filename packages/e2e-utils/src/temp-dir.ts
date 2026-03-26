import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { TempDirContext } from "./types.js";

export function createTempDir(prefix = "axm-e2e-"): TempDirContext {
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  return {
    path: tempPath,
    cleanup: () => {
      try {
        fs.rmSync(tempPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors in tests.
      }
    },
  };
}

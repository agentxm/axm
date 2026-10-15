import * as fs from "node:fs";

import { createTempDir } from "./temp-dir.js";
import type { TempDirContext } from "./types.js";

export function copyFixture(sourcePath: string, prefix = "axm-fixture-"): TempDirContext {
  const temp = createTempDir(prefix);
  try {
    fs.cpSync(sourcePath, temp.path, { recursive: true });
    return temp;
  } catch (copyError) {
    try {
      temp.cleanup();
    } catch (cleanupError) {
      throw new AggregateError([copyError, cleanupError], "Fixture copy and cleanup failed", {
        cause: cleanupError,
      });
    }
    throw copyError;
  }
}

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleListRule } from "./list.js";

describe("rules list", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-list-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("emits the shared inventory document with source and locked columns", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      rules: { "commit-style": { source: "@acme/rules/commit-style", enabled: true } },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleListRule();

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [
            {
              type: "rule",
              name: "commit-style",
              enabled: true,
              source: "@acme/rules/commit-style",
              locked: false,
            },
          ],
        });
      }),
    );
  });
});

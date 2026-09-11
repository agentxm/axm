import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleRootVersion } from "./command.js";

/**
 * The bump word is argument grammar this route owns: the feature takes a typed
 * change, so an unknown word, a `set` without a version, and a version passed
 * to a relative bump never reach it.
 */
describe("version argument grammar", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-version-grammar-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const rows = [
    {
      label: "an unknown bump word",
      bump: "huge",
      targetVersion: Option.none<string>(),
      code: "validation",
      contains: "Invalid version bump: huge",
    },
    {
      label: "`set` without an exact version",
      bump: "set",
      targetVersion: Option.none<string>(),
      code: "usage",
      contains: "`set` requires an exact semver version",
    },
    {
      label: "an exact version passed to a relative bump",
      bump: "patch",
      targetVersion: Option.some("1.2.3"),
      code: "usage",
      contains: 'Version target is only valid with "set"',
    },
  ] as const;

  for (const row of rows)
    it.effect(`refuses ${row.label}`, () => {
      writeWorkspaceFiles(path.join(tempDir, ".axm"));
      const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
      return provide(
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            handleRootVersion({
              handle: "@acme/skills/review",
              bump: row.bump,
              targetVersion: row.targetVersion,
              preview: false,
            }),
          );

          expect(failure).toMatchObject({ code: row.code });
          expect(String(failure.detail)).toContain(row.contains);
        }),
      );
    });
});

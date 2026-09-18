import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { paintText } from "../../screen/index.js";
import type { TestRendererState } from "../../test-support/presenter-test.js";
import { makeWorkspaceHandlerTestContext } from "../../test-support/test-helpers.js";
import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
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

/** The page a person reads, painted without colour or width limits. */
const painted = (state: TestRendererState): ReadonlyArray<string> =>
  state.docs.flatMap((entry) => paintText(entry.doc, { width: "unbounded", colors: false }));

/**
 * A preview is the plan ledger every plan-family command prints: the row names
 * both versions and the manifest, and one verdict states that nothing was
 * written.
 */
describe("version preview", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-version-preview-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeAuthoredSkill = () => {
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ owner: "@acme", agents: [], skills: { review: "workspace" } }),
    );
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
    const packageRoot = path.join(tempDir, "skills", "review");
    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "skill.json"),
      JSON.stringify({
        $schema: "https://axm.sh/schemas/skill.schema.json",
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.2.0",
        description: "Review code",
        license: "MIT",
      }),
    );
    fs.writeFileSync(
      path.join(packageRoot, "src", "SKILL.md"),
      '---\nname: "review"\ndescription: "Review code"\n---\n\n# review\n',
    );
    return path.join(packageRoot, "skill.json");
  };

  it.effect("states one verdict and writes nothing", () => {
    const manifest = writeAuthoredSkill();
    const { provide, rendererState } = makeWorkspaceHandlerTestContext();
    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@acme/skills/review",
          bump: "minor",
          targetVersion: Option.none(),
          preview: true,
        });

        const lines = painted(rendererState);
        expect(lines).toContain(
          " ~   @acme/skills/review           1.3.0     update   from 1.2.0, 1 file, skills/review/skill.json",
        );
        expect(lines.filter((line) => line.startsWith("Would "))).toEqual([
          "Would update 1 skill  1 to update · nothing was written",
        ]);
        expect(JSON.parse(fs.readFileSync(manifest, "utf8"))).toMatchObject({ version: "1.2.0" });
      }),
    );
  });
});

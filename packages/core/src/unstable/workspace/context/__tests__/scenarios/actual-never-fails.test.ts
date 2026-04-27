/**
 * Scenario: Actual cells never fail in the error channel.
 *
 * Spec requirement coverage:
 *
 * - Partial scanner failure → readable subset returned + scanner warning
 *   published. Triggered via the test layer's `wrapFileSystem` option that
 *   adapts the fixture's in-memory `FileSystem` so a single dir fails with a
 *   `PermissionDenied` error. Production code is unchanged; only test
 *   plumbing differs.
 * - Workspace-root escape fails provider construction (Layer error), not a
 *   per-cell call.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { validAll, type FixtureSpec } from "../../__fixtures__/builder.js";
import { WorkspaceContextTest } from "../../__fixtures__/test-layer.js";
import { WorkspaceContext } from "../../context.js";
import { WorkspaceRootEscape } from "../../errors.js";
import {
  expectSome,
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
} from "./_harness.js";

describe("actual cells never fail", () => {
  it.effect("valid spec → skills.actual succeeds with no error in the channel", () =>
    runScenario(validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(ctx.scope("project").skills.actual);
        expect(Exit.isSuccess(exit)).toBe(true);
      }),
    ),
  );

  it.effect("partial scanner failure: actual returns readable subset + warning published", () =>
    Effect.gen(function* () {
      // Compose the test layer with `wrapFileSystem` to fail `readDirectory`
      // on a deep path inside one owner's tree, leaving the other owner
      // readable. The canonical-extensions scanner publishes a `scanner-io`
      // warning when `childEntries(srcDir)` fails. The readable owner
      // continues to produce occurrences. The intercepted path is
      // `@unreadable/skills/src` (the canonical scanner's per-owner
      // `<type-plural>/src` directory).
      const UNREADABLE_SRC_DIR = `${SCENARIO_WORKSPACE_ROOT}/.axm/extensions/@unreadable/skills/src`;

      const spec: FixtureSpec = {
        workspaceRoot: SCENARIO_WORKSPACE_ROOT,
        userHome: SCENARIO_USER_HOME,
        project: {
          axmExtensions: {
            "@readable/skills/src/readable-skill/SKILL.md": "# readable\n",
            "@unreadable/skills/src/unreadable-skill/SKILL.md": "# unreadable\n",
          },
        },
      };

      const failingFs = (baseFs: FileSystem.FileSystem): FileSystem.FileSystem =>
        FileSystem.makeNoop({
          exists: (path) => baseFs.exists(path),
          readFileString: (path) => baseFs.readFileString(path),
          readDirectory: (path) => {
            if (path === UNREADABLE_SRC_DIR) {
              return Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "readDirectory",
                  description: "permission denied",
                  pathOrDescriptor: path,
                }),
              );
            }
            return baseFs.readDirectory(path);
          },
        });

      const program = Effect.gen(function* () {
        const ctx = yield* WorkspaceContext;
        const project = ctx.scope("project");
        // The actual cell still succeeds despite the partial failure.
        const actual = yield* project.skills.actual;
        const diagnostics = yield* project.diagnostics;
        return { actual, diagnostics };
      }).pipe(Effect.provide(WorkspaceContextTest(spec, { wrapFileSystem: failingFs })));

      const result = yield* program;

      // Readable owner's skill still surfaces; the unreadable owner emits
      // a scanner-io warning instead of a hard error.
      const readable = result.actual.filter((a) => a.key.name === "readable-skill");
      expect(readable.length).toBeGreaterThanOrEqual(1);

      const scannerWarnings = result.diagnostics.filter((w) => w.source === "scanner");
      expect(scannerWarnings.length).toBeGreaterThan(0);
    }),
  );
});

describe("workspace-root escape fails Layer construction", () => {
  it.effect("Layer.build fails with WorkspaceRootEscape when projectRoot escapes allowedRoot", () =>
    Effect.gen(function* () {
      const layer = WorkspaceContextTest(validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), {
        allowedRoot: "/different/root",
      });
      const built = Effect.gen(function* () {
        yield* WorkspaceContext;
      }).pipe(Effect.provide(layer));
      const exit = yield* Effect.exit(built);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const err = expectSome(Cause.findErrorOption(exit.cause));
        expect(err).toBeInstanceOf(WorkspaceRootEscape);
      }
    }),
  );

  it.effect(
    "actual cell type carries no error channel — Effect.exit always Success on valid roots",
    () =>
      runScenario(validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          // Verify each actual cell never fails on a valid spec.
          const project = ctx.scope("project");
          const skillsExit = yield* Effect.exit(project.skills.actual);
          expect(Exit.isSuccess(skillsExit)).toBe(true);
          const commandsExit = yield* Effect.exit(project.commands.actual);
          expect(Exit.isSuccess(commandsExit)).toBe(true);
          const mcpExit = yield* Effect.exit(project.mcpServers.actual);
          expect(Exit.isSuccess(mcpExit)).toBe(true);
          const subagentsExit = yield* Effect.exit(project.subagents.actual);
          expect(Exit.isSuccess(subagentsExit)).toBe(true);
          const filesExit = yield* Effect.exit(project.files.actual);
          expect(Exit.isSuccess(filesExit)).toBe(true);
          const rulesExit = yield* Effect.exit(project.rules.actual);
          expect(Exit.isSuccess(rulesExit)).toBe(true);
          const packsExit = yield* Effect.exit(project.packs.actual);
          expect(Exit.isSuccess(packsExit)).toBe(true);
        }),
      ),
  );
});

/**
 * Scenario: AXM-454 closure for the new WorkspaceReadModel.
 *
 * Spec requirement coverage:
 *
 * - _Installed skills survive invalid lockfile_: corrupt `axm-lock.yaml` +
 *   valid `settings.json` declaring skills + actual materializations →
 *   `project.skills.installed` returns the rows derivable from declared +
 *   actual; `project.diagnostics` includes a `source: "lockfile"` warning.
 * - _Raw lockfile cell still exposes invalid lockfile_: `project.state.lockfile`
 *   via `Effect.result` still surfaces `LockfileReadError`.
 *
 * The conjunction of both — installed inventory remains computable AND raw
 * lockfile cell still tells the consumer the lockfile is corrupt — is the
 * AXM-454 regression test for the new context. The lint migration target
 * (`migrate-lint-to-workspace-context`) builds its rule contexts off
 * `installed`, so the prior class of "lockfile decode failure silently drops
 * every rule input" can no longer happen.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type { FixtureSpec } from "../../__fixtures__/builder.js";
import { LockfileDecodeError, LockfileIoError, LockfileParseError } from "../../errors.js";
import {
  expectFailure,
  expectFirst,
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
  tagsOf,
  withResult,
} from "./_harness.js";

const LOCKFILE_TAGS: ReadonlySet<string> = new Set([
  "LockfileIoError",
  "LockfileParseError",
  "LockfileDecodeError",
]);

/**
 * AXM-454 fixture: byte-corrupt lockfile + valid settings declaring a skill +
 * an actual materialization for the declared skill.
 */
const axm454Spec: FixtureSpec = {
  workspaceRoot: SCENARIO_WORKSPACE_ROOT,
  userHome: SCENARIO_USER_HOME,
  project: {
    settings: {
      _tag: "valid",
      contents: {
        skills: { "managed-tool": "github:owner/managed-tool" },
      },
    },
    lockfile: {
      _tag: "byteCorrupt",
      // Mid-document YAML break that the parser will reject.
      bytes: "lockfileVersion: [oh: no\nbroken: !! tags",
    },
    agentDirs: {
      "claude-code": {
        "skills/managed-tool/SKILL.md": "# managed-tool\n",
      },
    },
  },
};

describe("AXM-454 closure (workspace-context)", () => {
  it.effect(
    "installed skills are computable from declared + actual when the lockfile is corrupt",
    () =>
      runScenario(axm454Spec, (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");
          const installedExit = yield* Effect.exit(project.skills.installed);
          // installed never fails — the projection swallows lockfile errors
          // via `Effect.result` and continues with degraded resolved evidence.
          expect(Exit.isSuccess(installedExit)).toBe(true);
          if (!Exit.isSuccess(installedExit)) return;

          const installed = installedExit.value;
          // The declared skill produces a `direct` installed row.
          const managedTool = expectFirst(
            installed.filter((r) => r.key.name === "managed-tool"),
            "expected installed row for managed-tool",
          );
          expect(managedTool.installationOrigin._tag).toBe("direct");
          // The actual occurrence under `.claude/skills/managed-tool` attaches
          // to the installed row, even though the lockfile is unreadable.
          expect(managedTool.actual.length).toBeGreaterThan(0);
        }),
      ),
  );

  it.effect("diagnostics include a lockfile warning when the lockfile is corrupt", () =>
    runScenario(axm454Spec, (ctx) =>
      Effect.gen(function* () {
        const project = ctx.scope("project");
        // Trigger the projection to populate diagnostics with the
        // tolerated lockfile error.
        yield* project.skills.installed;
        const warnings = yield* project.diagnostics;
        const lockfileWarnings = warnings.filter((w) => w.source === "lockfile");
        expect(lockfileWarnings.length).toBeGreaterThan(0);
      }),
    ),
  );

  it.effect("raw state.lockfile still surfaces LockfileReadError via Effect.result", () =>
    runScenario(axm454Spec, (ctx) =>
      Effect.gen(function* () {
        const project = ctx.scope("project");
        const failure = expectFailure(yield* withResult(project.state.lockfile));
        // The exact tag must be one of the three lockfile family tags.
        const tag =
          failure instanceof LockfileIoError
            ? "LockfileIoError"
            : failure instanceof LockfileParseError
              ? "LockfileParseError"
              : failure instanceof LockfileDecodeError
                ? "LockfileDecodeError"
                : "OTHER";
        expect(LOCKFILE_TAGS.has(tag)).toBe(true);
      }),
    ),
  );

  it.effect(
    "AXM-454 conjunction: installed rows derivable AND lockfile warning AND raw cell exposes the failure",
    () =>
      runScenario(axm454Spec, (ctx) =>
        Effect.gen(function* () {
          const project = ctx.scope("project");

          // 1. installed returns the row derivable from declared + actual.
          const installed = yield* project.skills.installed;
          expect(installed.some((r) => r.key.name === "managed-tool")).toBe(true);

          // 2. diagnostics include a lockfile warning.
          const warnings = yield* project.diagnostics;
          expect(warnings.some((w) => w.source === "lockfile")).toBe(true);

          // 3. state.lockfile via Effect.result is a Failure with a
          //    LockfileReadError tag.
          const lockResult = yield* withResult(project.state.lockfile);
          expect(lockResult._tag).toBe("Failure");
          if (lockResult._tag === "Failure") {
            // `failure` is `LockfileReadError`, a tagged union — no cast.
            expect(LOCKFILE_TAGS.has(lockResult.failure._tag)).toBe(true);
          }

          // 4. The lockfile-failure tag set surfaced via `Effect.exit` is
          //    bounded by the three Lockfile* tags (≤3-tag quality
          //    constraint).
          const exit = yield* Effect.exit(project.state.lockfile);
          if (Exit.isFailure(exit)) {
            const tags = tagsOf(exit.cause);
            expect(tags.size).toBeGreaterThan(0);
            expect(tags.size).toBeLessThanOrEqual(3);
            for (const tag of tags) {
              expect(LOCKFILE_TAGS.has(tag)).toBe(true);
            }
          }
        }),
      ),
  );
});

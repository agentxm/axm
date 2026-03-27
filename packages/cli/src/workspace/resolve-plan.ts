/**
 * CLI-only plan resolution function.
 *
 * Orchestrates core's `augmentPlanWithReconciliation`, `scanPlanReadiness`,
 * and `applyPlan` with CLI's `displayPlan` and interactive prompts.
 *
 * This is a free function, not a method on the WorkspaceContextService.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { createDefaultSettings, readSettings, type Settings } from "@axm.sh/core/unstable/settings";
import {
  applyPlan,
  augmentPlanWithReconciliation,
  scanPlanReadiness,
  type ExecutedPlan,
  type LockfileState,
  type Plan,
} from "@axm.sh/core/unstable/workspace";
import { Workspace } from "./service.js";
import { displayPlan } from "./display-plan.js";
import type { AppError } from "@axm.sh/core/unstable/app-error";
// Side-effect import: registers reconciliation adapters with core
import "./reconciliation.js";

/**
 * Resolve (display, confirm, and apply) a plan using the workspace context.
 *
 * Steps:
 * 1. Augment plan with lockfile reconciliation if needed
 * 2. Scan for errors/warnings
 * 3. Handle errors (block unless --force) and warnings (display)
 * 4. Preview if requested (with confirmation unless --yes)
 * 5. Apply and display results
 */
export const resolvePlan = Effect.fn("resolvePlan")(function* (
  plan: Plan,
  flags: { yes: boolean; force: boolean; preview: boolean },
) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const prompt = yield* CliPrompt;
  const nonInteractive = yield* isNonInteractive;
  const resolvedYes = flags.yes || nonInteractive;

  // Capture FS layer for augmentPlan
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fsLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );

  const getLockfileState = (): Effect.Effect<LockfileState, AppError> => ws.getLockfileState();

  const readSettingsSafe = (dir: string): Effect.Effect<Settings, AppError> =>
    readSettings(dir).pipe(
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
      Effect.provide(fsLayer),
    );

  const showPlan = (targetPlan: Plan | ExecutedPlan) =>
    displayPlan(targetPlan).pipe(Effect.provide(Layer.succeed(CliRenderer, renderer)));

  // Step 1: Lockfile reconciliation
  const augmented = yield* augmentPlanWithReconciliation(
    plan,
    getLockfileState,
    ws.baseDir,
    ws.path,
    readSettingsSafe,
    fsLayer,
  );

  if (augmented.reconciliationTriggered && augmented.reason === "invalid") {
    yield* renderer.warn("LOCKFILE_INVALID_RECONCILE");
  }

  const augmentedPlan = augmented.plan;

  // Step 2: Scan readiness
  const readiness = scanPlanReadiness(augmentedPlan);

  // Step 3: Handle errors
  if (readiness.hasErrors) {
    if (flags.force) {
      yield* Effect.forEach(readiness.errorMessages, (msg) => renderer.warn(msg));
    } else {
      yield* showPlan(augmentedPlan);
      return yield* makeAppError({
        code: "PLAN_BLOCKED_BY_ERRORS",
        what: "Plan has errors that prevent execution",
        details: readiness.errorMessages,
        howToFix: "Re-run with --force to override",
      });
    }
  }

  // Step 4: Handle warnings
  if (readiness.hasWarnings) {
    yield* Effect.forEach(readiness.warnMessages, (msg) => renderer.warn(msg));
  }

  // Step 5: Preview
  if (flags.preview) {
    yield* renderer.info("Previewing changes...");
    yield* showPlan(augmentedPlan);

    // In non-interactive mode without explicit --yes, preview is display-only (dry-run)
    if (nonInteractive && !flags.yes) {
      return {
        _tag: "ExecutedPlan",
        name: augmentedPlan.name,
        description: augmentedPlan.description,
        jobs: [],
      } satisfies ExecutedPlan;
    }

    if (!resolvedYes) {
      const confirmed = yield* prompt.confirm({ message: "Apply changes?" });
      if (!confirmed) {
        yield* renderer.success("Cancelled.");
        return {
          _tag: "ExecutedPlan",
          name: augmentedPlan.name,
          description: augmentedPlan.description,
          jobs: [],
        } satisfies ExecutedPlan;
      }
    }
  }

  // Step 6: Apply and display
  const executed = yield* applyPlan(augmentedPlan);
  yield* showPlan(executed);
  return executed;
});

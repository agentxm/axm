/**
 * Plan resolution function.
 *
 * Orchestrates `augmentPlanWithReconciliation`, `scanPlanReadiness`,
 * and `applyPlan` with `displayPlan` and interactive prompts.
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
import { isNonInteractive } from "../cli-flags/index.js";
import { CliRenderer } from "../cli-renderer/index.js";
import { CliPrompt } from "../cli-prompt/index.js";
import { makeAppError } from "../app-error/index.js";
import type { AppError } from "../app-error/index.js";
import { createDefaultSettings, readSettings, type Settings } from "../settings/index.js";
import { applyPlan } from "./apply-plan.js";
import { augmentPlanWithReconciliation, type LockfileState } from "./augment-plan.js";
import { scanPlanReadiness } from "./scan-plan-readiness.js";
import { setReconciliationAdapters } from "./reconciliation.js";
import type { CancelledPlan, ExecutedPlan, Plan, PreviewedPlan } from "./plan.js";
import { Workspace } from "./service-interface.js";
import { skillReconciliationAdapter } from "../skills/reconciliation-adapter.js";
import { commandReconciliationAdapter } from "../commands/reconciliation-adapter.js";
import { mcpServerReconciliationAdapter } from "../mcp-servers/reconciliation-adapter.js";
import { extensionPackReconciliationAdapter } from "../packs/reconciliation-adapter.js";
import { subagentReconciliationAdapter } from "../subagents/reconciliation-adapter.js";
import { displayPlan } from "./display-plan.js";

// Register reconciliation adapters with core
setReconciliationAdapters([
  skillReconciliationAdapter,
  commandReconciliationAdapter,
  subagentReconciliationAdapter,
  mcpServerReconciliationAdapter,
  extensionPackReconciliationAdapter,
]);

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
        _tag: "PreviewedPlan",
        name: augmentedPlan.name,
        description: augmentedPlan.description,
        jobs: augmentedPlan.jobs,
      } satisfies PreviewedPlan;
    }

    if (!resolvedYes) {
      const confirmed = yield* prompt.confirm({ message: "Apply changes?" });
      if (!confirmed) {
        yield* renderer.success("Cancelled.");
        return {
          _tag: "CancelledPlan",
          name: augmentedPlan.name,
          description: augmentedPlan.description,
          jobs: augmentedPlan.jobs,
        } satisfies CancelledPlan;
      }
    }
  }

  // Step 6: Apply and display
  const executed = yield* applyPlan(augmentedPlan);
  yield* showPlan(executed);
  return executed;
});

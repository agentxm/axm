/**
 * The `upgrade` command adapter: read the running version, ask
 * `@agentxm/cli-update` what the request selects, settle it as a preview or an
 * apply, and render the assessment as the machine document and the human
 * view.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  AssessUpgrade,
  HOMEBREW_FORMULA,
  PerformUpgrade,
  UpgradeAssessmentResultSchema,
  UpgradeFailed,
  UpgradeWorkingDirectory,
  type UpgradeAssessmentResult,
} from "@agentxm/cli-update";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { makeAppError, type AppError } from "../../app-error/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import { ExecutionDirectory } from "../../execution-directory.js";
import { Screen } from "../../screen/index.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { loadVersion } from "../../version.js";
import { upgradeView } from "./view.js";

export const UpgradeDocumentSchema = Schema.Struct({ result: UpgradeAssessmentResultSchema });
export type UpgradeDocument = typeof UpgradeDocumentSchema.Type;

/**
 * The capability chose the category and the sentence at construction, so the
 * envelope carries them over 1:1.
 */
const upgradeFailedToAppError = (error: UpgradeFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

export interface UpgradeHandlerArgs {
  readonly reinstall: boolean;
  /** Optional exact stable version. Omit to use the promoted stable channel. */
  readonly requestedVersion?: string | undefined;
  /** Resolve and report the upgrade without performing it. */
  readonly preview?: boolean;
  /** Test/internal override for an observed local version. */
  readonly localVersion?: string | null;
}

const upgradeSuggestions = (result: UpgradeAssessmentResult): ReadonlyArray<SuggestedAction> => {
  if (result.disposition === "previewed") {
    return [{ description: "Perform the upgrade this preview resolved", cmd: "axm upgrade" }];
  }
  if (result.recovery.recommendedCommand !== null) {
    return [{ description: "Next safe action", cmd: result.recovery.recommendedCommand.display }];
  }
  switch (result.details.homebrewFailure) {
    case "target-formula-unavailable":
      return [
        { description: "Retry after Homebrew publishes the selected formula", cmd: "axm upgrade" },
      ];
    case "formula-ahead-of-target":
      return [
        {
          description:
            "Reconcile the current Homebrew formula with the selected release before retrying",
        },
      ];
    case "formula-query-failed":
      return [
        {
          description: "Inspect the Homebrew formula response",
          cmd: `brew info ${HOMEBREW_FORMULA}`,
        },
      ];
    case "refresh-failed":
    case "tap-query-failed":
    case "tap-preparation-failed":
    case "delegation-failed":
      return [{ description: "Resolve the recorded Homebrew failure before retrying" }];
    case "manager-version-unchanged":
    case "manager-version-mismatch":
      return [
        {
          description: "Inspect Homebrew's installed and linked AXM state",
          cmd: `brew info ${HOMEBREW_FORMULA}`,
        },
      ];
    case "path-version-unavailable":
    case "path-version-mismatch":
    case "manager-path-disagreement":
      return [
        { description: "Reconcile the AXM executable identities shown in verification evidence" },
      ];
    case null:
      break;
  }
  if (
    result.disposition === "upgraded" ||
    result.disposition === "reinstalled" ||
    result.disposition === "already-current"
  ) {
    return [{ description: "Verify CLI and official-skill compatibility", cmd: "axm lint" }];
  }
  return [{ description: "Verify installed version", cmd: "axm --version" }];
};

const renderHuman = (result: UpgradeAssessmentResult) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    yield* Effect.forEach(
      upgradeView(result, verbosity.level),
      (entry) => (entry.channel === "result" ? screen.result(entry.doc) : screen.note(entry.doc)),
      { discard: true },
    );
  });

export const handleUpgrade = Effect.fn("Upgrade.handle")(function* (args: UpgradeHandlerArgs) {
  const screen = yield* Screen;
  const executionDirectory = yield* ExecutionDirectory;
  const preview = args.preview === true;
  const request = {
    reinstall: args.reinstall,
    localVersion: args.localVersion === undefined ? loadVersion() : args.localVersion,
    ...(args.requestedVersion === undefined ? {} : { requestedVersion: args.requestedVersion }),
  };

  // Detection, release selection, availability, and the upgrade itself are
  // the units of one observed operation; assessment and rendering follow it.
  const result = yield* withLiveOperation(
    {
      command: "upgrade",
      name: preview ? "Preview AXM upgrade" : "Upgrade AXM",
      mode: preview ? "preview" : "apply",
      ...(preview ? { successOutcome: "previewed" as const } : {}),
    },
    (preview
      ? AssessUpgrade.query(request)
      : PerformUpgrade.prepare(request).pipe(
          Effect.flatMap((candidate) =>
            PerformUpgrade.previewOrApply(candidate, { mode: "apply" }),
          ),
        )
    ).pipe(
      Effect.provideService(UpgradeWorkingDirectory, { path: executionDirectory.path }),
      Effect.mapError(upgradeFailedToAppError),
    ),
  );

  yield* setCommandSemanticProperties(
    summarizeCommandOutcome({
      outcome: result.outcome === "applied" ? "applied" : "no-op",
      subjectType: "unknown",
      sourceKind: "git",
      appliedCount: result.outcome === "applied" ? 1 : 0,
      failedCount: result.outcome === "failed" || result.outcome === "indeterminate" ? 1 : 0,
      blockedCount: result.outcome === "failed" ? 1 : 0,
    }),
  );
  if (
    yield* screen.document({ result }, UpgradeDocumentSchema, {
      suggestions: upgradeSuggestions(result),
      ok:
        result.disposition === "previewed" ||
        result.disposition === "upgraded" ||
        result.disposition === "reinstalled" ||
        result.disposition === "already-current" ||
        result.disposition === "local-newer",
    })
  ) {
    return;
  }
  yield* renderHuman(result);
}, Effect.asVoid);

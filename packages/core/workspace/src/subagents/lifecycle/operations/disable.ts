import * as Array from "effect/Array";
/**
 * Disable subagent executor — removes rendered files but preserves canonical source.
 *
 * Materialized artifacts are observed directly. Accepted-resolution rows identify
 * source content but do not prove that canonical or projected files exist.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { NativeWriteAuthority } from "../../../projection/agent-adapters/index.js";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodingAgentRepository, findManagedSubagentFiles } from "../../../projection/index.js";
import { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import {
  StepFailureConversion,
  withAdaptedStepFailures,
} from "../../../lifecycle/step-failure-conversion.js";
import type { OperationHandler } from "../../../transitions/planning/index.js";
import type { Operation } from "../../../transitions/planning/index.js";
import type { JobStepResult } from "../../../transitions/planning/index.js";
import {
  DesiredStateReader,
  type SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../../../desired-state/index.js";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "../../../transitions/settlement/index.js";
import { subagentLifecycleArtifact } from "./artifact.js";
import * as Schema from "effect/Schema";
import { RenderedFilePathSchema } from "../../../desired-state/index.js";
import { sanitizeName } from "../../../desired-state/index.js";
import { installedRowsByName } from "../../../desired-state/index.js";

const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Disable a subagent (remove rendered files but keep settings/lockfile entry).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DisableSubagentOperation = Operation<
  "disable-subagent",
  { readonly subagentName: string }
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Disable-subagent operation handler.
 *
 * Determines lifecycle from the workspace read model, removes observable
 * rendered files, and promotes implicit pack members to a direct disabled
 * preference. Canonical source files are preserved for later re-enablement.
 */
export const disableSubagent: OperationHandler<
  DisableSubagentOperation,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | WorkspaceRecords
  | DesiredStateReader
  | SettingsReader
  | SettingsWriter
  | WorkspaceTransactionScope
  | CodingAgentRepository
  | NativeWriteAuthority
  | StepFailureConversion
> = (op) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const records = yield* WorkspaceRecords;
    const desiredState = yield* DesiredStateReader;
    const settingsWriter = yield* SettingsWriter;
    const agentRepo = yield* CodingAgentRepository;
    const path = yield* Path.Path;

    // Read lifecycle to determine promotion needs
    const installedSubagents = yield* records
      .rows("subagent")
      .pipe(Effect.map(installedRowsByName));
    const installed = installedSubagents[op.args.subagentName];
    const isImplicit = installed !== undefined && installed.lifecycle === "implicit";
    const graph = yield* desiredState.graph();
    if (!graph.complete) {
      return yield* new ExtensionLifecycleFailed({
        category: "conflict",
        detail: "Cannot disable the subagent while pack-derived desired state is unresolved.",
      });
    }
    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    const renderedFiles = yield* runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        if (isImplicit) {
          // An implicit subagent is supplied by a Pack. Record the preference
          // only; the Pack stays the sole owner of the member's source.
          yield* settingsWriter.setEntry("subagent", op.args.subagentName, {
            kind: "configuration",
            enabled: false,
          });
        } else {
          yield* settingsWriter.updateEntry("subagent", op.args.subagentName, (entry) => ({
            ...entry,
            enabled: false,
          }));
        }

        const removed = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            Effect.gen(function* () {
              const resolved = yield* agent.resolveEffectiveSubagentsDir({
                workspaceRoot: location.baseDir,
                scope: location.scope,
              });
              if (resolved._tag !== "supported") return Option.none();
              const managedPaths = yield* findManagedSubagentFiles(
                resolved.dir,
                sanitizeName(op.args.subagentName),
              );
              const entries = managedPaths.map((filePath) => ({
                path: path.relative(location.baseDir, filePath),
              }));
              const outcome = yield* agent.removeSubagent({
                workspaceRoot: location.baseDir,
                scope: location.scope,
                subagentName: op.args.subagentName,
                renderedFilePaths: entries.map((entry) => decodeRenderedFilePath(entry.path)),
              });
              if (outcome._tag === "conflict") {
                return yield* new ExtensionLifecycleFailed({
                  category: "conflict",
                  detail: `Subagent removal failed for ${agent.id}: ${outcome.reason}`,
                });
              }
              return Option.some([agent.id, entries] as const);
            }),
          { concurrency: 1 },
        );
        return Object.fromEntries(Array.getSomes(removed));
      }),
      validate: () => Effect.void,
    });

    return {
      result: "success",
      message: `Disabled ${op.args.subagentName}`,
      artifact: subagentLifecycleArtifact({
        name: op.args.subagentName,
        scope: location.scope,
        ...(configuredAgents.length === 0
          ? {}
          : { agents: configuredAgents.map((agent) => agent.id) }),
        change: "updated",
        renderedFiles,
        renderedChange: "removed",
      }),
    } satisfies JobStepResult;
  }).pipe(withAdaptedStepFailures);

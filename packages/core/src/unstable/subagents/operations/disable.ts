/**
 * Disable subagent executor — removes rendered files but preserves canonical source.
 *
 * Materialized artifacts are observed directly. Receipts are not consulted:
 * they are optional post-success history, not lifecycle authority.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodingAgentRepository } from "../../agents/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { subagentLifecycleArtifact } from "./artifact.js";
import { findManagedSubagentFiles } from "../../workspace/rendered-file-cleanup.js";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { RenderedFilePathSchema } from "../../extensions/index.js";
import { sanitizeName } from "../../extensions/utils.js";
import { installedRowsByName } from "../../workspace/read-model-record-rows.js";

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
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // Read lifecycle to determine promotion needs
    const installedSubagents = yield* ws.records
      .rows("subagent")
      .pipe(Effect.map(installedRowsByName));
    const installed = installedSubagents[op.args.subagentName];
    const isImplicit = installed !== undefined && installed.lifecycle === "implicit";
    const graph = yield* ws.getDesiredStateGraph();
    if (!graph.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail: "Cannot disable the subagent while pack-derived desired state is unresolved.",
      });
    }
    const desiredBeforeDisable = graph.nodes.find(
      (node) => node.type === "subagent" && node.name === op.args.subagentName,
    );

    const renderedFiles: Record<string, ReadonlyArray<{ readonly path: string }>> = {};
    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    yield* ws.runTransaction({
      transition: Effect.gen(function* () {
        if (isImplicit) {
          const source =
            desiredBeforeDisable?.source ?? Option.getOrElse(installed.source, () => undefined);
          if (source === undefined) {
            return yield* makeAppError({
              code: "internal",
              detail: `Cannot determine source for implicit subagent "${op.args.subagentName}"`,
              suggestions: [{ description: "Provide a source when disabling this subagent" }],
            });
          }
          yield* ws.setSubagentEntry(op.args.subagentName, {
            source,
            enabled: false,
          });
        } else {
          yield* ws.updateSubagentEntry(op.args.subagentName, (entry) => ({
            ...entry,
            enabled: false,
          }));
        }

        yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.resolveEffectiveSubagentsDir({ workspaceRoot: ws.baseDir, scope: ws.scope }).pipe(
              Effect.provide(fsPathLayer),
              Effect.flatMap((resolved) =>
                resolved._tag === "supported"
                  ? findManagedSubagentFiles(resolved.dir, sanitizeName(op.args.subagentName)).pipe(
                      Effect.provide(fsPathLayer),
                      Effect.flatMap((managedPaths) => {
                        renderedFiles[agent.id] = managedPaths.map((filePath) => ({
                          path: path.relative(ws.baseDir, filePath),
                        }));
                        return agent
                          .removeSubagent({
                            workspaceRoot: ws.baseDir,
                            scope: ws.scope,
                            subagentName: op.args.subagentName,
                            renderedFilePaths: managedPaths.map((filePath) =>
                              decodeRenderedFilePath(path.relative(ws.baseDir, filePath)),
                            ),
                          })
                          .pipe(
                            Effect.flatMap((outcome) =>
                              outcome._tag === "conflict"
                                ? makeAppError({
                                    code: "conflict",
                                    detail: `Subagent removal failed for ${agent.id}: ${outcome.reason}`,
                                  })
                                : Effect.void,
                            ),
                          );
                      }),
                    )
                  : Effect.void,
              ),
            ),
          { concurrency: "unbounded" },
        );
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
      validate: () => Effect.void,
    });

    return {
      result: "success",
      message: `Disabled ${op.args.subagentName}`,
      artifact: subagentLifecycleArtifact({
        name: op.args.subagentName,
        scope: ws.scope,
        ...(configuredAgents.length === 0
          ? {}
          : { agents: configuredAgents.map((agent) => agent.id) }),
        change: "updated",
        renderedFiles,
        renderedChange: "removed",
      }),
    } satisfies JobStepResult;
  });

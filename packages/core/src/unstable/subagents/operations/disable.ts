/**
 * Disable subagent executor — removes rendered files but preserves canonical source.
 *
 * Three paths:
 * - Lock entry present: full disable (remove rendered files + clear lock + settings)
 * - No lock entry, configured: settings-only toggle
 * - No lock entry, implicit: promote to configured entry with enabled: false
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
import type { SubagentLockEntry } from "../../lockfile/index.js";
import { subagentLifecycleArtifact } from "./artifact.js";
import { findManagedSubagentFiles } from "../../workspace/rendered-file-cleanup.js";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { RenderedFilePathSchema } from "../../extensions/index.js";

const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Derive a source string from lock entry metadata for implicit subagent promotion. */
const deriveSourceString = (lockEntry: SubagentLockEntry): string => {
  switch (lockEntry.type) {
    case "local":
      return lockEntry.path;
    case "registry":
      return `${lockEntry.owner}/subagents/${lockEntry.name}`;
    case "workspace":
      return `workspace:@${lockEntry.owner}/subagents/${lockEntry.name}`;
    case "github":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "gitlab":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "bitbucket":
      return `${lockEntry.owner}/${lockEntry.repo}`;
    case "azurerepos":
      return `${lockEntry.organization}/${lockEntry.project}/${lockEntry.repo}`;
    case "git":
      return lockEntry.url;
  }
};

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
 * Determines lifecycle via getInstalledSubagents, then branches:
 *
 * Implicit subagent -> promote to configured entry with enabled: false
 *   - If lock entry exists: also remove rendered files
 *   - If no lock entry: settings promotion only
 *
 * Configured subagent with lock entry -> full lock-backed disable
 *   - Remove rendered files, update settings
 *
 * Configured subagent without lock entry -> settings-only toggle
 *
 * Canonical source files are preserved for later re-enablement.
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
    const installedSubagents = yield* ws.records.getInstalledSubagents();
    const installed = installedSubagents[op.args.subagentName];
    const isImplicit = installed !== undefined && installed.lifecycle === "implicit";

    // Check for lock entry
    const lockEntryOption = yield* ws.getLockedSubagent(op.args.subagentName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read lockfile: ${e.message}`,
          cause: e,
        }),
      ),
    );
    const lockEntry = Option.getOrUndefined(lockEntryOption);
    const hasLockEntry = lockEntry !== undefined;

    const renderedFiles: Record<string, ReadonlyArray<{ readonly path: string }>> = {};
    const configuredAgents = hasLockEntry ? yield* agentRepo.getConfiguredAgents() : [];

    // Lock-backed file operations (when lock entry exists)
    if (hasLockEntry) {
      // Remove rendered files via CodingAgent.removeSubagent()
      yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent.resolveEffectiveSubagentsDir({ workspaceRoot: ws.baseDir, scope: ws.scope }).pipe(
            Effect.provide(fsPathLayer),
            Effect.flatMap((resolved) =>
              resolved._tag === "supported"
                ? findManagedSubagentFiles(resolved.dir).pipe(
                    Effect.provide(fsPathLayer),
                    Effect.flatMap((managedPaths) => {
                      renderedFiles[agent.id] = managedPaths.map((filePath) => ({
                        path: path.relative(ws.baseDir, filePath),
                      }));
                      return agent.removeSubagent({
                        workspaceRoot: ws.baseDir,
                        scope: "project",
                        subagentName: op.args.subagentName,
                        renderedFilePaths: managedPaths.map((filePath) =>
                          decodeRenderedFilePath(filePath),
                        ),
                      });
                    }),
                  )
                : Effect.void,
            ),
          ),
        { concurrency: "unbounded" },
      );
    }

    // State mutation: implicit promotion or configured toggle
    if (isImplicit) {
      // Implicit promotion: derive source via deterministic fallback order
      // 1. lock entry metadata  2. fail
      const source = hasLockEntry ? deriveSourceString(lockEntry) : undefined;
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
      // Configured subagent — toggle enabled flag
      yield* ws
        .updateSubagentEntry(op.args.subagentName, (e) => ({ ...e, enabled: false }))
        .pipe(Effect.catch(() => Effect.void));
    }

    const version =
      hasLockEntry && lockEntry.type === "registry" ? lockEntry.resolvedVersion : undefined;

    return {
      result: "success",
      message: `Disabled ${op.args.subagentName}`,
      artifact: subagentLifecycleArtifact({
        name: op.args.subagentName,
        scope: ws.scope,
        ...(configuredAgents.length === 0
          ? {}
          : { agents: configuredAgents.map((agent) => agent.id) }),
        ...(version === undefined ? {} : { version }),
        change: "updated",
        ...(hasLockEntry ? { renderedFiles } : {}),
        renderedChange: "removed",
      }),
    } satisfies JobStepResult;
  });

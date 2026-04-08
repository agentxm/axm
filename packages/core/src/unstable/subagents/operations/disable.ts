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
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CodingAgentRepository } from "../../agents/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation } from "../../workspace/plan.js";
import type { JobStepResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import type { SubagentLockEntry } from "../../lockfile/index.js";

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
  FileSystem.FileSystem | Path.Path | Workspace | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const agentRepo = yield* CodingAgentRepository;

    // Read lifecycle to determine promotion needs
    const installedSubagents = yield* ws.getInstalledSubagents();
    const installed = installedSubagents[op.args.subagentName];
    const isImplicit = installed !== undefined && installed.lifecycle === "implicit";

    // Check for lock entry
    const lockEntryOption = yield* ws.getLockedSubagent(op.args.subagentName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "DISABLE_SUBAGENT_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    const hasLockEntry = Option.isSome(lockEntryOption);

    // Lock-backed file operations (when lock entry exists)
    if (hasLockEntry) {
      const lockEntry = lockEntryOption.value;
      const renderedFiles = lockEntry.renderedFiles ?? {};

      // Build a layer to provide FileSystem + Path to inner effects
      const fsPathLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fs),
        Layer.succeed(Path.Path, path),
      );

      // Remove rendered files via CodingAgent.removeSubagent()
      const configuredAgents = yield* agentRepo
        .getConfiguredAgents()
        .pipe(Effect.provideService(Workspace, ws));

      yield* Effect.forEach(
        configuredAgents,
        (agent) => {
          const agentFiles = renderedFiles[agent.id] ?? [];
          return agent
            .removeSubagent({
              workspaceRoot: ws.baseDir,
              scope: "project",
              subagentName: op.args.subagentName,
              renderedFilePaths: agentFiles.map((f) => f.path),
            })
            .pipe(Effect.provide(fsPathLayer));
        },
        { concurrency: "unbounded" },
      );
    }

    // State mutation: implicit promotion or configured toggle
    if (isImplicit) {
      // Implicit promotion: derive source via deterministic fallback order
      // 1. lock entry metadata  2. fail
      const source = hasLockEntry ? deriveSourceString(lockEntryOption.value) : undefined;
      if (source === undefined) {
        return yield* makeAppError({
          code: "DISABLE_SUBAGENT_NO_SOURCE",
          what: `Cannot determine source for implicit subagent "${op.args.subagentName}"`,
          howToFix: "Provide a source when disabling this subagent",
        });
      }
      yield* ws.setSubagentEntry(op.args.subagentName, { source, enabled: false });
    } else {
      // Configured subagent — toggle enabled flag
      yield* ws
        .updateSubagentEntry(op.args.subagentName, (e) => ({ ...e, enabled: false }))
        .pipe(Effect.catch(() => Effect.void));
    }

    return {
      result: "success",
      message: `Disabled ${op.args.subagentName}`,
    } satisfies JobStepResult;
  });

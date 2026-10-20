/**
 * Shared subagent sync helpers for coding-agent service implementations.
 *
 * Provides common logic for writing and removing subagent files in agent
 * subagents directories. Each agent adapter delegates to these helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { assertNativeMutationWithinRoots, resolveNativeReferent } from "../../locations/index.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { SubagentIoFailed, type CodingAgentFailure } from "../errors.js";
import { NativeWriteAuthority, type NativeWriteRefused } from "../native-write-authority.js";
import { renderSubagent } from "./rendering/index.js";
import type {
  AddSubagentArgs,
  RemoveSubagentArgs,
  ResolveSubagentsDirOutcome,
  SubagentSyncOutcome,
} from "../agents/coding-agent.js";

/** Failures the shared subagent sync helpers raise. */
export type SubagentSyncFailure = SubagentIoFailed | NativeWriteRefused;

/**
 * Write rendered subagent files to an agent's subagents directory.
 *
 * Handles directory creation and file writing.
 * Returns a `SubagentSyncOutcome` with the rendered file paths and any warnings.
 */
const writeSubagentFiles = (
  subagentsDir: string,
  args: AddSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  SubagentSyncFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;

    const descriptor = isConfigurableAgentId(args.input.agentId)
      ? AGENT_DESCRIPTORS[args.input.agentId].subagents
      : undefined;
    if (
      descriptor?.locations.some(
        (location) => location.scope === args.scope && location.shape === "file",
      ) === true ||
      args.input.agentId === "kiro-cli" ||
      args.input.agentId === "kiro"
    )
      return {
        _tag: "unsupported",
        reason: `Native Subagent ownership proof is not supported for ${args.input.agentId}`,
      } as const;
    // Render filenames; the supplied catalog location alone owns placement.
    const renderResult = renderSubagent(args.input);
    if (renderResult === undefined) {
      return {
        _tag: "unsupported",
        reason: `Subagent rendering not supported for ${args.input.agentId}`,
      } as const;
    }
    if (renderResult._tag === "Skipped") {
      return {
        _tag: "skipped",
        reason: renderResult.reason,
      } as const;
    }

    const resolvedOutputs = yield* Effect.forEach(
      renderResult.outputs,
      (output) =>
        assertNativeMutationWithinRoots(
          args.nativeRoots ?? [args.workspaceRoot],
          path.resolve(subagentsDir, output.path),
          "content",
          args.workspaceRoot,
        ).pipe(
          Effect.map(({ address }) => ({
            output,
            filePath: address.referentPath ?? address.entryPath,
          })),
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({ detail: "Cannot resolve physical Subagent output", cause }),
          ),
        ),
      { concurrency: 1 },
    );

    const eligibleDirectory =
      args.nativeInsertionEligiblePaths?.has(
        yield* resolveNativeReferent(subagentsDir).pipe(
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({
                detail: "Cannot resolve Subagent publication directory",
                cause,
              }),
          ),
        ),
      ) === true;
    const renderedFilePaths: Array<string> = [];
    const nativeTargets: Array<{
      path: string;
      kind: "subagent";
      change: "created" | "updated" | "unchanged";
      decision: "current" | "record" | "write";
    }> = [];
    for (const { output, filePath } of resolvedOutputs) {
      const written = yield* authority.withExclusiveWrite(
        filePath,
        Effect.gen(function* () {
          const { address } = yield* assertNativeMutationWithinRoots(
            args.nativeRoots ?? [args.workspaceRoot],
            filePath,
            "content",
            args.workspaceRoot,
          ).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({ detail: `Unsafe Subagent output: ${filePath}`, cause }),
            ),
          );
          if (address.kind !== "absent" && address.kind !== "file")
            return {
              _tag: "conflict",
              reason: `Preserved unowned Subagent entry: ${filePath}`,
            } as const;
          const prior = yield* fs.readFileString(filePath).pipe(Effect.option);
          const decision = args.decideWrite({ filePath, prior, rendered: output.content });
          if (decision._tag === "conflict") return decision;
          if (decision._tag !== "write")
            return { _tag: "written", change: "unchanged", decision: decision._tag } as const;
          const capture = yield* authority.captureCreatedDirectories({
            path: filePath,
            unit: JSON.stringify(["subagent-parent-directories", filePath]),
            eligible: args.nativeInsertionEligible === true || eligibleDirectory,
          });
          yield* authority.protect(filePath);
          const createdDirectories = yield* authority.createParentDirectories(filePath);
          yield* fs.writeFileString(filePath, output.content).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({
                  detail: `Failed to write subagent file: ${filePath}`,
                  cause,
                }),
            ),
          );
          yield* authority.record({
            path: filePath,
            change: Option.isSome(prior) ? "modified" : "created",
          });
          yield* authority.recordCreatedDirectories({ capture, createdDirectories });
          return {
            _tag: "written",
            change: Option.isSome(prior) ? "updated" : "created",
            decision: "write",
          } as const;
        }),
      );
      if (written._tag === "conflict") return written;
      nativeTargets.push({
        path: filePath,
        kind: "subagent",
        change: written.change,
        decision: written.decision,
      });
      renderedFilePaths.push(filePath);
    }

    return {
      _tag: "success",
      nativeTargets,
      renderedFilePaths,
      warnings: renderResult.warnings.map((w) => `[${w.agent}] ${w.feature}: ${w.message}`),
    } as const;
  });

/**
 * Remove subagent files from an agent's subagents directory.
 *
 * Each file is deleted only when the caller's removal decision allows it; a
 * retained file is reported, never an error. A missing file is already gone.
 */
export const removeSubagentFiles = (
  args: RemoveSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  SubagentSyncFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;

    const removedPaths: Array<string> = [];
    const retained: Array<{ readonly path: string; readonly reason: string }> = [];
    for (const renderedPath of args.renderedFilePaths) {
      const { address } = yield* assertNativeMutationWithinRoots(
        args.nativeRoots ?? [args.workspaceRoot],
        path.resolve(args.workspaceRoot, renderedPath),
        "content",
        args.workspaceRoot,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new SubagentIoFailed({ detail: `Unsafe Subagent removal: ${renderedPath}`, cause }),
        ),
      );
      const filePath = address.referentPath ?? address.entryPath;
      const removed = yield* authority.withExclusiveWrite(
        filePath,
        Effect.gen(function* () {
          const { address: current } = yield* assertNativeMutationWithinRoots(
            args.nativeRoots ?? [args.workspaceRoot],
            filePath,
            "content",
            args.workspaceRoot,
          ).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({ detail: `Unsafe Subagent removal: ${filePath}`, cause }),
            ),
          );
          if (current.kind !== "file") return { _tag: "absent" } as const;
          const raw = yield* fs.readFileString(filePath).pipe(Effect.option);
          if (Option.isNone(raw)) return { _tag: "absent" } as const;
          const decision = args.decideRemoval({ filePath, bytes: raw.value });
          if (decision._tag === "retain") return decision;
          yield* authority.protect(filePath);
          yield* fs.remove(filePath).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({
                  detail: `Failed to remove subagent file: ${filePath}`,
                  cause,
                }),
            ),
          );
          yield* authority.record({ path: filePath, change: "removed" });
          yield* authority.retireCreatedDirectories({
            path: filePath,
            unit: JSON.stringify(["subagent-parent-directories", filePath]),
          });
          return { _tag: "delete" } as const;
        }),
      );
      if (removed._tag === "delete") removedPaths.push(filePath);
      if (removed._tag === "retain") retained.push({ path: filePath, reason: removed.reason });
    }

    return {
      _tag: "success",
      renderedFilePaths: removedPaths,
      retained,
      warnings: retained.map(({ reason }) => reason),
    } as const;
  });

/**
 * Convert a non-supported ResolveSubagentsDirOutcome to a SubagentSyncOutcome.
 */
const dirOutcomeToSubagentSyncOutcome = (
  outcome: Exclude<ResolveSubagentsDirOutcome, { readonly _tag: "supported" }>,
): SubagentSyncOutcome => ({
  _tag: "unsupported",
  reason: outcome.reason,
});

/**
 * Add a subagent using a resolve function.
 *
 * Common pattern used by most agent adapters.
 */
export const addSubagentViaResolve = (
  resolve: Effect.Effect<
    ResolveSubagentsDirOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path
  >,
  args: AddSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSubagentSyncOutcome(dirOutcome);
    }
    return yield* writeSubagentFiles(dirOutcome.dir, args);
  });

/**
 * Remove a subagent using a resolve function.
 *
 * Common pattern used by most agent adapters.
 */
export const removeSubagentViaResolve = (
  resolve: Effect.Effect<
    ResolveSubagentsDirOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path
  >,
  args: RemoveSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSubagentSyncOutcome(dirOutcome);
    }
    return yield* removeSubagentFiles(args);
  });

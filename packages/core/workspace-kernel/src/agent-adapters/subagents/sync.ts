/**
 * Shared subagent sync helpers for coding-agent service implementations.
 *
 * Provides common logic for writing and removing subagent files in agent
 * subagents directories. Each agent adapter delegates to these helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { readFileStringIfPresent, writeFilePreservingIdentity } from "@agentxm/host-primitives";
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

/** One prepared physical output, including every logical reader that selected it. */
export interface PreparedSubagentFileArgs extends Pick<
  AddSubagentArgs,
  | "workspaceRoot"
  | "nativeRoots"
  | "nativeInsertionEligible"
  | "nativeInsertionEligiblePaths"
  | "decideWrite"
> {
  readonly filePath: string;
  readonly content: string;
  readonly bindings: ReadonlyArray<{
    readonly path: string;
    readonly directory: string;
  }>;
}

/** Apply prepared bytes once, with live alias and ownership decisions under the write lock. */
export const writePreparedSubagentFile = Effect.fn("axm.subagent.apply")(function* (
  args: PreparedSubagentFileArgs,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const authority = yield* NativeWriteAuthority;
  const filePath = path.resolve(args.filePath);
  const result = yield* authority.withExclusiveWrite(
    filePath,
    Effect.gen(function* () {
      // Re-resolve every claimant: an alias retargeted since planning no longer
      // participates in this physical unit, even when its former target survives.
      for (const requested of new Set([
        filePath,
        ...args.bindings.map((binding) => binding.path),
      ])) {
        const { address } = yield* assertNativeMutationWithinRoots(
          args.nativeRoots ?? [args.workspaceRoot],
          requested,
          "content",
          args.workspaceRoot,
        ).pipe(
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({ detail: "Cannot resolve prepared Subagent output", cause }),
          ),
        );
        if ((address.referentPath ?? address.entryPath) !== filePath)
          return {
            _tag: "conflict",
            reason: `Subagent output identity changed after preparation: ${requested}`,
          } as const;
        if (requested === filePath && address.kind !== "absent" && address.kind !== "file")
          return {
            _tag: "conflict",
            reason: `Preserved unowned Subagent entry: ${requested}`,
          } as const;
      }
      const prior = yield* readFileStringIfPresent(fs, filePath).pipe(
        Effect.mapError(
          (cause) =>
            new SubagentIoFailed({
              detail: `Cannot read current Subagent output: ${filePath}`,
              cause,
            }),
        ),
      );
      const decision = args.decideWrite({ filePath, prior, rendered: args.content });
      if (decision._tag === "conflict") return decision;
      if (decision._tag !== "write")
        return { _tag: "written", change: "unchanged", decision: decision._tag } as const;
      let eligibleDirectory = false;
      if (args.nativeInsertionEligiblePaths !== undefined) {
        for (const directory of new Set(args.bindings.map((binding) => binding.directory))) {
          const physical = yield* resolveNativeReferent(directory).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({
                  detail: "Cannot resolve Subagent publication directory",
                  cause,
                }),
            ),
          );
          if (args.nativeInsertionEligiblePaths.has(physical)) eligibleDirectory = true;
        }
      }
      const capture = yield* authority.captureCreatedDirectories({
        path: filePath,
        unit: JSON.stringify(["subagent-parent-directories", filePath]),
        eligible: args.nativeInsertionEligible === true || eligibleDirectory,
      });
      yield* authority.protect(filePath);
      const createdDirectories = yield* authority.createParentDirectories(filePath);
      yield* writeFilePreservingIdentity(fs, {
        targetPath: filePath,
        content: args.content,
        onPublished: (publication) =>
          authority.record(
            { path: filePath, change: Option.isSome(prior) ? "modified" : "created" },
            publication,
          ),
        mapError: (cause) =>
          new SubagentIoFailed({ detail: `Failed to write subagent file: ${filePath}`, cause }),
      }).pipe(Effect.withSpan("axm.subagent.publish"));
      yield* authority.recordCreatedDirectories({ capture, createdDirectories });
      return {
        _tag: "written",
        change: Option.isSome(prior) ? "updated" : "created",
        decision: "write",
      } as const;
    }),
  );
  yield* Effect.annotateCurrentSpan(
    "axm.changed",
    result._tag === "written" && result.decision === "write",
  );
  return result;
});

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
    const path = yield* Path.Path;

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

    const renderedFilePaths: Array<string> = [];
    const nativeTargets: Array<{
      path: string;
      kind: "subagent";
      change: "created" | "updated" | "unchanged";
      decision: "current" | "record" | "write";
    }> = [];
    for (const { output, filePath } of resolvedOutputs) {
      const written = yield* writePreparedSubagentFile({
        ...args,
        filePath,
        content: output.content,
        bindings: [{ path: path.resolve(subagentsDir, output.path), directory: subagentsDir }],
      });
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

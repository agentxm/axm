/**
 * Install skill executor — orchestrates the full per-skill installation pipeline.
 *
 * Dispatches to a per-refType install function via `switch(ref.refType)`, then
 * runs shared post-install steps (agent symlinks, lockfile/settings writes).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../agents/index.js";
import { sourceToLockEntry } from "../../sources/index.js";
import {
  type RenderedFilePath,
  type RenderedFilesMap,
  RenderedFilePathSchema,
} from "../../extensions/index.js";
import * as Schema from "effect/Schema";
import type {
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
} from "../refs.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import {
  computeIntegrity,
  createSymlink,
  isPathSafe,
  removeFromAllCanonicalLocations,
  stripFileProtocol,
} from "../../utils/index.js";
import { validatePathSafety } from "../../extensions/index.js";
import { errInstallFailed, makeAppError } from "../../app-error/index.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { copyExtensionDirectory, sanitizeName } from "../../extensions/utils.js";
import type { InstallResult } from "./install-result.js";
import {
  buildUniversalSkillArtifact,
  computeSkillSourceHash,
  universalSkillsTargetDir,
} from "./universal-artifact.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the install-skill operation.
 */
export type InstallSkillOperationArgs = {
  readonly ref: SkillExtensionRef;
  readonly force: boolean;
  /** Version constraint from the original input when available. */
  readonly versionRange: Option.Option<string>;
  /** When true, write to lockfile only (skip settings). Used for pack dependencies. */
  readonly skipSettings: Option.Option<boolean>;
  /** When true, fail on unknown configured agents instead of warning+skip. */
  readonly strictUnknownAgents: Option.Option<boolean>;
  /** When updating, preserve the original install timestamp instead of using now. */
  readonly existingInstalledAt: Option.Option<Date>;
  /** Named registry source that provided the ref (written to lockfile for registry skills). */
  readonly sourceName: Option.Option<string>;
};

/**
 * Add a skill to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallSkillOperation = Operation<"install-skill", InstallSkillOperationArgs>;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type MaterializedSkill = {
  readonly skillSrcPath: string;
  readonly versionRange: Option.Option<string>;
};

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const preCleanAndCopy = (sanitizedName: string, sourcePath: string, copyTarget: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    yield* removeFromAllCanonicalLocations(fs, ws.baseDir, "skills", sanitizedName, path);
    yield* copyExtensionDirectory(sourcePath, copyTarget).pipe(
      Effect.mapError((e) =>
        errInstallFailed({
          message: "Skill files could not be copied to the canonical location",
          cause: e,
        }),
      ),
    );
  });

const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

export { computeSkillSourceHash } from "./universal-artifact.js";

/**
 * Build a RenderedFilesMap from per-agent copy-mode install results.
 * Only includes agents where mode === "copy" and success === true.
 *
 * @internal Exported for testing only.
 */
export const buildRenderedFilesFromResults = (
  installableTargets: ReadonlyArray<{ agentId: AgentId; targetDir: string }>,
  agentResults: ReadonlyArray<InstallResult>,
): RenderedFilesMap => {
  const result: Record<string, Array<{ path: RenderedFilePath }>> = {};
  for (const [target, installResult] of Array.zip(installableTargets, agentResults)) {
    if (installResult.mode === "copy" && installResult.success) {
      result[target.agentId] = [{ path: decodeRenderedFilePath(installResult.path) }];
    }
  }
  return result;
};

// -----------------------------------------------------------------------------
// Per-refType install functions
// -----------------------------------------------------------------------------

const installFromGitHosted = (ref: GitHostedSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, skillSrcPath);

    const sourcePath = stripFileProtocol(ref.location);
    yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);

    return { skillSrcPath, versionRange: Option.none() } satisfies MaterializedSkill;
  });

const installFromLocal = (ref: LocalSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, skillSrcPath);

    const sourcePath = stripFileProtocol(ref.location);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(skillSrcPath);
    if (!isSelfCopy) {
      yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);
    }

    return { skillSrcPath, versionRange: Option.none() } satisfies MaterializedSkill;
  });

const installFromRegistry = (
  ref: RegistrySkillRef,
  sanitizedName: string,
  versionRange: Option.Option<string>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ws = yield* WorkspaceMutations;

    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: "registry",
      owner: ref.owner,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    // Synthetic refs from publish may have no integrity — use existing canonical
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: e,
        }),
      ),
    );
    const useExisting = Option.isNone(ref.integrity) && canonicalExists;

    if (!useExisting) {
      const locationStr =
        ref.source.location.protocol === "file:"
          ? ref.source.location.pathname
          : ref.source.location.href;
      const client = yield* createRegistryClient(locationStr);
      const { archive } = yield* client.getExtensionPackage({
        owner: ref.owner,
        type: "skill",
        name: ref.name,
        version: Option.some(ref.version),
      });

      if (Option.isSome(ref.integrity)) {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity.value) {
          return yield* makeAppError({
            code: "internal",
            detail: `Integrity mismatch for ${ref.name}@${ref.version}`,
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          errInstallFailed({
            message: "Temporary directory for registry install could not be created",
            cause: e,
          }),
        ),
      );
      yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* extractZip(archive, tmpDir);
          yield* preCleanAndCopy(sanitizedName, tmpDir, canonicalPath);
        }),
        fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
      );
    }

    return { skillSrcPath, versionRange } satisfies MaterializedSkill;
  });

// -----------------------------------------------------------------------------
// Agent symlink helper
// -----------------------------------------------------------------------------

const installForDirectory = (opts: {
  readonly targetDir: string;
  readonly canonicalSkillSrcPath: string;
  readonly sanitizedName: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const agentSkillPath = path.join(opts.targetDir, opts.sanitizedName);

    // Validate agent path safety
    if (!isPathSafe(ws.baseDir, agentSkillPath)) {
      return {
        success: false,
        mode: "symlink",
        symlinkFailed: false,
        error: Option.some(`Path traversal detected for target directory ${opts.targetDir}`),
        path: agentSkillPath,
        canonicalPath: opts.canonicalSkillSrcPath,
      } satisfies InstallResult;
    }

    // Try symlink, fall back to copy
    return yield* createSymlink({
      target: opts.canonicalSkillSrcPath,
      link: agentSkillPath,
    }).pipe(
      Effect.map(
        () =>
          ({
            success: true,
            mode: "symlink",
            symlinkFailed: false,
            error: Option.none(),
            path: agentSkillPath,
            canonicalPath: opts.canonicalSkillSrcPath,
          }) satisfies InstallResult,
      ),
      Effect.catch(() =>
        copyExtensionDirectory(opts.canonicalSkillSrcPath, agentSkillPath).pipe(
          Effect.map(
            () =>
              ({
                success: true,
                mode: "copy",
                symlinkFailed: true,
                error: Option.none(),
                path: agentSkillPath,
                canonicalPath: opts.canonicalSkillSrcPath,
              }) satisfies InstallResult,
          ),
          Effect.catch((copyErr) =>
            Effect.succeed({
              success: false,
              mode: "copy",
              symlinkFailed: true,
              error: Option.some(`Copy fallback failed: ${copyErr.message}`),
              path: agentSkillPath,
              canonicalPath: opts.canonicalSkillSrcPath,
            } satisfies InstallResult),
          ),
        ),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Dispatch helper
// -----------------------------------------------------------------------------

const materializeSkill = (
  ref: SkillExtensionRef,
  sanitizedName: string,
  versionRange: Option.Option<string>,
) => {
  switch (ref.refType) {
    case "git-hosted":
      return installFromGitHosted(ref, sanitizedName);
    case "registry":
      return installFromRegistry(ref, sanitizedName, versionRange);
    case "local":
      return installFromLocal(ref, sanitizedName);
  }
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Install-skill operation handler.
 *
 * Dispatches to a per-refType install function producing a MaterializedSkill,
 * then runs shared post-install steps:
 * 1. Create symlinks from each agent's skills dir (concurrent)
 * 2. Update lockfile/settings entry (failures logged as warnings)
 * 3. Compute and return overall result
 */
export const installSkill: OperationHandler<
  InstallSkillOperation,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | CliRenderer
  | SourceHostProviders
  | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const renderer = yield* CliRenderer;
    const agentRepo = yield* CodingAgentRepository;
    const { ref } = op.args;
    const agents = yield* ws.getConfiguredAgents();
    const sanitizedName = sanitizeName(ref.skill.name);
    const strictUnknownAgents = Option.getOrElse(op.args.strictUnknownAgents, () => false);

    // ── Per-refType: resolve source, copy to canonical ──────────────
    const materialized = yield* materializeSkill(ref, sanitizedName, op.args.versionRange);

    // ── Shared: resolve agent targets + install once per distinct dir ────────
    const configuredAgents = yield* agentRepo
      .getConfiguredAgents()
      .pipe(Effect.provideService(WorkspaceMutations, ws));
    const unknownConfiguredAgentIds = yield* agentRepo
      .getUnknownConfiguredAgentIds()
      .pipe(Effect.provideService(WorkspaceMutations, ws));

    if (strictUnknownAgents && unknownConfiguredAgentIds.length > 0) {
      const message = `Unknown configured agents in strict mode: ${unknownConfiguredAgentIds.join(", ")}`;
      return {
        result: "error",
        message,
        error: makeAppError({
          code: "not_found",
          detail: message,
        }),
      } satisfies JobStepResult;
    }

    if (unknownConfiguredAgentIds.length > 0) {
      yield* renderer.warn(
        `Skipping unknown configured agents: ${unknownConfiguredAgentIds.join(", ")}`,
      );
    }

    const resolvedAgents = yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        agent
          .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      { concurrency: "unbounded" },
    );

    const misconfigured = Array.filter(
      resolvedAgents,
      ({ outcome }) => outcome._tag === "misconfigured",
    );
    if (misconfigured.length > 0) {
      const message = `Failed to resolve skills directories for ${ref.skill.name}`;
      return {
        result: "error",
        message,
        error: makeAppError({
          code: "validation",
          detail: message,
        }),
      } satisfies JobStepResult;
    }

    const skippedByOutcome = Array.filter(
      resolvedAgents,
      ({ outcome }) => outcome._tag === "unsupported" || outcome._tag === "disabled",
    );
    if (skippedByOutcome.length > 0) {
      const skippedMessage = skippedByOutcome
        .map(({ agentId, outcome }) =>
          outcome._tag === "supported"
            ? `${agentId}: not skipped`
            : `${agentId}: ${outcome.reason}`,
        )
        .join(", ");
      yield* renderer.warn(`Skipping non-installable configured agents: ${skippedMessage}`);
    }

    const installableTargets: Array<{ agentId: AgentId; targetDir: string }> = [];
    for (const { agentId, outcome } of resolvedAgents) {
      if (outcome._tag === "supported") {
        installableTargets.push({
          agentId,
          targetDir: path.normalize(outcome.dir),
        });
      }
    }
    const universalTargetDir = universalSkillsTargetDir(ws.baseDir, path);
    // Dedup target directories — agents sharing UNIVERSAL_SKILLS_DIR (".agents/skills")
    // resolve to the same path and receive a single symlink rather than duplicates.
    // The universal directory is also an always-on workspace-level target.
    const distinctDirs = Array.dedupe([
      ...installableTargets.map((target) => target.targetDir),
      universalTargetDir,
    ]);
    const perDirectoryResults = yield* Effect.forEach(
      distinctDirs,
      (targetDir) =>
        installForDirectory({
          targetDir,
          canonicalSkillSrcPath: materialized.skillSrcPath,
          sanitizedName,
        }).pipe(Effect.map((result) => ({ targetDir, result }))),
      { concurrency: "unbounded" },
    );

    const agentResults: ReadonlyArray<InstallResult> = installableTargets.map((target) => {
      const matched = perDirectoryResults.find((item) => item.targetDir === target.targetDir);
      if (matched === undefined) {
        return {
          success: false,
          mode: "copy",
          symlinkFailed: true,
          error: Option.some(`No installation result for target directory ${target.targetDir}`),
          path: target.targetDir,
          canonicalPath: materialized.skillSrcPath,
        } satisfies InstallResult;
      }
      return matched.result;
    });
    const universalResult = perDirectoryResults.find(
      (item) => item.targetDir === universalTargetDir,
    )?.result;
    if (universalResult === undefined) {
      return {
        result: "error",
        message: `Failed to install ${ref.skill.name} in the universal skills directory`,
        error: makeAppError({
          code: "internal",
          detail: `No installation result for universal skills directory ${universalTargetDir}`,
        }),
      } satisfies JobStepResult;
    }
    const universalArtifact = universalResult.success
      ? yield* buildUniversalSkillArtifact({
          artifactPath: universalResult.path,
          canonicalSkillSrcPath: materialized.skillSrcPath,
        })
      : undefined;
    const trackedTargets = installableTargets.filter(
      (target) => target.targetDir !== universalTargetDir,
    );
    const trackedResults = trackedTargets.map((target) => {
      const matched = perDirectoryResults.find((item) => item.targetDir === target.targetDir);
      if (matched === undefined) {
        return {
          success: false,
          mode: "copy",
          symlinkFailed: true,
          error: Option.some(`No installation result for target directory ${target.targetDir}`),
          path: target.targetDir,
          canonicalPath: materialized.skillSrcPath,
        } satisfies InstallResult;
      }
      return matched.result;
    });

    // ── Shared: compute rendered files tracking for copy-mode ──────
    const hasCopyResults = trackedResults.some((r) => r.mode === "copy" && r.success);
    const renderedFiles = hasCopyResults
      ? buildRenderedFilesFromResults(trackedTargets, trackedResults)
      : undefined;
    const sourceHash = hasCopyResults
      ? yield* computeSkillSourceHash(materialized.skillSrcPath)
      : undefined;

    // ── Shared: update lockfile + settings ──────────────────────────
    const baseLockEntry = sourceToLockEntry({
      ref,
      agents,
      now: new Date(),
      sourceName: op.args.sourceName,
      existingInstalledAt: op.args.existingInstalledAt,
    });
    const lockEntry = {
      ...baseLockEntry,
      ...(sourceHash !== undefined ? { sourceHash } : {}),
      ...(renderedFiles !== undefined ? { renderedFiles } : {}),
      ...(universalArtifact !== undefined ? { universalArtifact } : {}),
    };

    if (lockEntry.type === "registry") {
      yield* validateExactResolvedVersion(
        `skills.${ref.skill.name}.resolvedVersion`,
        lockEntry.resolvedVersion,
      );
    }

    const skillArgs = {
      name: ref.skill.name,
      lockEntry,
      versionRange: materialized.versionRange,
    };
    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setSkillLock(skillArgs)
      : ws.setSkill(skillArgs);
    yield* writeEffect.pipe(
      Effect.catch((e) => renderer.warn(`Skill update failed: ${String(e)}`)),
    );

    // ── Shared: compute result ──────────────────────────────────────
    const allResults = [...agentResults, universalResult];
    const anyFailed = allResults.some((r) => !r.success);

    if (anyFailed) {
      const failedAgents = allResults
        .filter((r) => !r.success)
        .map((r) => Option.getOrElse(r.error, () => "unknown error"));
      const message = `Failed to install ${ref.skill.name} for some agents: ${failedAgents.join(", ")}`;
      return {
        result: "error",
        message,
        error: makeAppError({
          code: "internal",
          detail: message,
        }),
      } satisfies JobStepResult;
    }

    return {
      result: "success",
      message: `Installed ${ref.skill.name}`,
    } satisfies JobStepResult;
  });

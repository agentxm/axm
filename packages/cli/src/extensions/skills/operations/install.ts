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
import type { AgentId } from "@axm.sh/core/unstable/agents";
import { CliEnvConfig } from "../../../config/index.js";
import { sourceToLockEntry } from "@axm.sh/core/unstable/sources";
import type {
  BuiltinSkillRef,
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
} from "@axm.sh/core/unstable/sources";
import { SourceHostProviders } from "../../../sources/index.js";
import { DefaultCodingAgentRepository } from "../../../agents/repository.js";
import { Output } from "@axm.sh/core/unstable/output";
import {
  computeIntegrity,
  createSymlink,
  isPathSafe,
  removeFromAllCanonicalLocations,
  stripFileProtocol,
} from "@axm.sh/core/unstable/utils";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { createRegistryClient, extractZip } from "../../../registry/index.js";
import { validateExactResolvedVersion } from "@axm.sh/core/unstable/lockfile";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "./copy-directory.js";
import type { InstallResult } from "./install-result.js";
import { sanitizeName } from "../utils.js";

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
  readonly versionConstraint: Option.Option<string>;
  /** When true, write to lockfile only (skip settings). Used for pack dependencies. */
  readonly skipSettings: Option.Option<boolean>;
  /** When true, fail on unknown configured agents instead of warning+skip. */
  readonly strictUnknownAgents?: Option.Option<boolean>;
  /** When updating, preserve the original install timestamp instead of using now. */
  readonly existingInstalledAt?: Option.Option<Date>;
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
  readonly versionConstraint: Option.Option<string>;
};

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const validatePathSafety = (baseDir: string, targetPath: string) =>
  isPathSafe(baseDir, targetPath)
    ? Effect.void
    : makeAppError({
        code: "INSTALL_SKILL_PATH_TRAVERSAL",
        what: `Path traversal detected: ${targetPath}`,
      });

const preCleanAndCopy = (sanitizedName: string, sourcePath: string, copyTarget: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    yield* removeFromAllCanonicalLocations(fs, ws.baseDir, sanitizedName, path);
    yield* copySkillDirectory(sourcePath, copyTarget).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "INSTALL_SKILL_COPY_FAILED",
          what: `Failed to copy skill files to ${copyTarget}`,
          cause: e,
        }),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Per-refType install functions
// -----------------------------------------------------------------------------

const installFromGitHosted = (ref: GitHostedSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, skillSrcPath);

    const sourcePath = stripFileProtocol(ref.location);
    yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);

    return { skillSrcPath, versionConstraint: Option.none() } satisfies MaterializedSkill;
  });

const installFromLocal = (ref: LocalSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, skillSrcPath);

    const sourcePath = stripFileProtocol(ref.location);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(skillSrcPath);
    if (!isSelfCopy) {
      yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);
    }

    return { skillSrcPath, versionConstraint: Option.none() } satisfies MaterializedSkill;
  });

// TODO: Effect.scoped closes finalizers before the caller uses the returned directory.
// When the builtin provider is implemented (currently a stub that always fails),
// the copy to canonical must happen *inside* the scope so the temp dir isn't cleaned up early.
const fetchSource = (ref: BuiltinSkillRef) =>
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const files = yield* sources.fetch(ref).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "INSTALL_SKILL_SOURCE_FETCH_FAILED",
          what: `Failed to fetch files for ${ref.skill.name}`,
          cause: error,
        }),
      ),
      Effect.scoped,
    );
    return files.directory;
  });

const installFromBuiltin = (ref: BuiltinSkillRef, sanitizedName: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: ref.refType,
    });
    yield* validatePathSafety(ws.baseDir, skillSrcPath);

    const sourcePath = yield* fetchSource(ref);
    yield* preCleanAndCopy(sanitizedName, sourcePath, skillSrcPath);

    return { skillSrcPath, versionConstraint: Option.none() } satisfies MaterializedSkill;
  });

const installFromRegistry = (
  ref: RegistrySkillRef,
  sanitizedName: string,
  versionConstraint: Option.Option<string>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ws = yield* Workspace;

    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: "registry",
      profile: ref.profile,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    // Synthetic refs (fork/publish) may have empty integrity — use existing canonical
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "INSTALL_SKILL_PATH_CHECK_FAILED",
          what: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: e,
        }),
      ),
    );
    const useExisting = ref.integrity === "" && canonicalExists;

    if (!useExisting) {
      const locationStr =
        ref.source.location.protocol === "file:"
          ? ref.source.location.pathname
          : ref.source.location.href;
      const client = yield* createRegistryClient(locationStr);
      const { archive } = yield* client.getExtensionPackage({
        handle: ref.profile,
        type: "skill",
        name: ref.name,
        version: Option.some(ref.version),
      });

      // Non-empty integrity -> validate
      if (ref.integrity !== "") {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity) {
          return yield* makeAppError({
            code: "INSTALL_SKILL_INTEGRITY_MISMATCH",
            what: `Integrity mismatch for ${ref.name}@${ref.version}`,
            details: [`Expected ${ref.integrity}, got ${actualIntegrity}`],
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "INSTALL_SKILL_TEMP_DIR_FAILED",
            what: `Failed to create temporary directory for registry install`,
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

    return { skillSrcPath, versionConstraint } satisfies MaterializedSkill;
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
    const ws = yield* Workspace;

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
        copySkillDirectory(opts.canonicalSkillSrcPath, agentSkillPath).pipe(
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
  versionConstraint: Option.Option<string>,
) => {
  switch (ref.refType) {
    case "git-hosted":
      return installFromGitHosted(ref, sanitizedName);
    case "registry":
      return installFromRegistry(ref, sanitizedName, versionConstraint);
    case "local":
      return installFromLocal(ref, sanitizedName);
    case "builtin":
      return installFromBuiltin(ref, sanitizedName);
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
  FileSystem.FileSystem | Path.Path | Workspace | Output | SourceHostProviders | CliEnvConfig
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const path = yield* Path.Path;
    const output = yield* Output;
    const { ref } = op.args;
    const agents = yield* ws.getConfiguredAgents();
    const sanitizedName = sanitizeName(ref.skill.name);
    const strictUnknownAgents = Option.getOrElse(
      op.args.strictUnknownAgents ?? Option.none(),
      () => false,
    );

    // ── Per-refType: resolve source, copy to canonical ──────────────
    const materialized = yield* materializeSkill(ref, sanitizedName, op.args.versionConstraint);

    // ── Shared: resolve agent targets + install once per distinct dir ────────
    const configuredAgents = yield* DefaultCodingAgentRepository.getConfiguredAgents().pipe(
      Effect.provideService(Workspace, ws),
    );
    const unknownConfiguredAgentIds =
      yield* DefaultCodingAgentRepository.getUnknownConfiguredAgentIds().pipe(
        Effect.provideService(Workspace, ws),
      );

    if (strictUnknownAgents && unknownConfiguredAgentIds.length > 0) {
      const message = `Unknown configured agents in strict mode: ${unknownConfiguredAgentIds.join(", ")}`;
      return {
        result: "error",
        message,
        error: makeAppError({
          code: "CODING_AGENT_UNKNOWN_CONFIGURED",
          what: message,
          details: unknownConfiguredAgentIds,
        }),
      } satisfies OperationResult;
    }

    if (unknownConfiguredAgentIds.length > 0) {
      yield* output.warn(
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
      const details = misconfigured.map(({ agentId, outcome }) =>
        outcome._tag === "misconfigured"
          ? `${agentId}: ${outcome.reason}`
          : `${agentId}: invalid skills directory configuration`,
      );
      const message = `Failed to resolve skills directories for ${ref.skill.name}`;
      return {
        result: "error",
        message,
        error: makeAppError({
          code: "SKILL_DIR_MISCONFIGURED",
          what: message,
          details,
        }),
      } satisfies OperationResult;
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
      yield* output.warn(`Skipping non-installable configured agents: ${skippedMessage}`);
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
    const distinctDirs = Array.dedupe(installableTargets.map((target) => target.targetDir));
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

    // ── Shared: update lockfile + settings ──────────────────────────
    const lockEntry = sourceToLockEntry({
      ref,
      agents,
      now: new Date(),
      sourceName: op.args.sourceName,
      existingInstalledAt: op.args.existingInstalledAt ?? Option.none(),
    });

    if (lockEntry.type === "registry") {
      yield* validateExactResolvedVersion(
        `skills.${ref.skill.name}.resolvedVersion`,
        lockEntry.resolvedVersion,
      );
    }

    const skillArgs = {
      name: ref.skill.name,
      lockEntry,
      versionConstraint: materialized.versionConstraint,
    };
    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setSkillLock(skillArgs)
      : ws.setSkill(skillArgs);
    yield* writeEffect.pipe(Effect.catch((e) => output.warn(`Skill update failed: ${String(e)}`)));

    // ── Shared: compute result ──────────────────────────────────────
    const anyFailed = agentResults.some((r) => !r.success);

    if (anyFailed) {
      const failedAgents = agentResults
        .filter((r) => !r.success)
        .map((r) => Option.getOrElse(r.error, () => "unknown error"));
      const message = `Failed to install ${ref.skill.name} for some agents: ${failedAgents.join(", ")}`;
      return {
        result: "error",
        message,
        error: makeAppError({
          code: "SKILL_INSTALL_PARTIAL_FAILED",
          what: message,
          details: failedAgents,
        }),
      } satisfies OperationResult;
    }

    return {
      result: "success",
      message: `Installed ${ref.skill.name}`,
    } satisfies OperationResult;
  });

/**
 * Install skill executor — orchestrates the full per-skill installation pipeline.
 *
 * Dispatches to a per-refType install function via `switch(ref.refType)`, then
 * runs shared post-install steps (agent symlinks, lockfile/settings writes).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { SourceHostProviders } from "../../../sources/index.js";
import { getAgentById } from "../../../agents/registry.js";
import { Log } from "../../../tui/index.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { computeIntegrity } from "../../../utils/integrity.js";
import { isPathSafe } from "../../../utils/path-safety.js";
import { makeCliError } from "../../../cli-error/index.js";
import { createRegistryClient, extractZip } from "../../../registry/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "../copy-skill-directory.js";
import type { InstallSkillOperation } from "../operations.js";
import { removeFromAllCanonicalLocations, stripFileProtocol } from "../fs-helpers.js";
import { sourceToLockEntry } from "../source-to-lock-entry.js";
import type { InstallResult } from "./install-result.js";
import { sanitizeName } from "./skill-utils.js";
import type {
  BuiltinSkillRef,
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
} from "../../../sources/types.js";

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
    : makeCliError({
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
        makeCliError({
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
        makeCliError({
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
      scope: ref.scope,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    // Synthetic refs (fork/publish) may have empty integrity — use existing canonical
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
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
        scope: ref.scope,
        type: "skill",
        name: ref.name,
        version: Option.some(ref.version),
      });

      const actualIntegrity = yield* computeIntegrity(archive);
      if (actualIntegrity !== ref.integrity) {
        return yield* makeCliError({
          code: "INSTALL_SKILL_INTEGRITY_MISMATCH",
          what: `Integrity mismatch for ${ref.name}@${ref.version}`,
          details: [`Expected ${ref.integrity}, got ${actualIntegrity}`],
        });
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeCliError({
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

const installForAgent = (opts: {
  readonly agentId: string;
  readonly canonicalSkillSrcPath: string;
  readonly sanitizedName: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const maybeAgent = getAgentById(opts.agentId);
    if (Option.isNone(maybeAgent)) {
      return {
        success: false,
        mode: "symlink",
        symlinkFailed: false,
        error: Option.some(`Unknown agent: ${opts.agentId}`),
        path: "",
        canonicalPath: opts.canonicalSkillSrcPath,
      } satisfies InstallResult;
    }
    const agent = maybeAgent.value;

    const agentSkillPath = path.join(ws.baseDir, agent.skills.dir, opts.sanitizedName);

    // Validate agent path safety
    if (!isPathSafe(ws.baseDir, agentSkillPath)) {
      return {
        success: false,
        mode: "symlink",
        symlinkFailed: false,
        error: Option.some(`Path traversal detected for agent ${opts.agentId}`),
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
      Effect.catchAll(() =>
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
          Effect.catchAll((copyErr) =>
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
  FileSystem.FileSystem | Path.Path | Workspace | Log | SourceHostProviders
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;
    const { ref } = op.args;
    const agents = yield* ws.getConfiguredAgents();
    const sanitizedName = sanitizeName(ref.skill.name);

    // ── Per-refType: resolve source, copy to canonical ──────────────
    const materialized = yield* (() => {
      switch (ref.refType) {
        case "git-hosted":
          return installFromGitHosted(ref, sanitizedName);
        case "registry":
          return installFromRegistry(ref, sanitizedName, op.args.versionConstraint);
        case "local":
          return installFromLocal(ref, sanitizedName);
        case "builtin":
          return installFromBuiltin(ref, sanitizedName);
      }
    })();

    // ── Shared: symlink to agents ───────────────────────────────────
    const agentResults = yield* Effect.forEach(
      agents,
      (agentId) =>
        installForAgent({
          agentId,
          canonicalSkillSrcPath: materialized.skillSrcPath,
          sanitizedName,
        }),
      { concurrency: "unbounded" },
    );

    // ── Shared: update lockfile + settings ──────────────────────────
    const lockEntry = sourceToLockEntry({
      ref,
      agents,
      now: new Date(),
      sourceName: Option.none(),
    });
    const skillArgs = {
      name: ref.skill.name,
      lockEntry,
      versionConstraint: materialized.versionConstraint,
    };
    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setSkillLock(skillArgs)
      : ws.setSkill(skillArgs);
    yield* writeEffect.pipe(Effect.catchAll((e) => log.warn(`Skill update failed: ${String(e)}`)));

    // ── Shared: compute result ──────────────────────────────────────
    const anyFailed = agentResults.some((r) => !r.success);

    if (anyFailed) {
      const failedAgents = agentResults
        .filter((r) => !r.success)
        .map((r) => Option.getOrElse(r.error, () => "unknown error"));
      return {
        result: "error",
        message: `Failed to install ${ref.skill.name} for some agents: ${failedAgents.join(", ")}`,
      } satisfies OperationResult;
    }

    return {
      result: "success",
      message: `Installed ${ref.skill.name}`,
    } satisfies OperationResult;
  });

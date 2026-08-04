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
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../agents/index.js";
import { sourceToLockEntry } from "../../sources/index.js";
import {
  UNIVERSAL_SKILLS_DIR,
  computePackageContentHash,
  type RenderedFilePath,
  type RenderedFilesMap,
  RenderedFilePathSchema,
  isUniversalSkillsDir,
  stripTrailingSeparators,
} from "../../extensions/index.js";
import * as Schema from "effect/Schema";
import type {
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
  WorkspaceSkillRef,
} from "../refs.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import {
  computeIntegrity,
  createSymlink,
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
  removeFromAllCanonicalLocations,
  stripFileProtocol,
} from "../../utils/index.js";
import { shouldReuseCanonicalInstall, validatePathSafety } from "../../extensions/index.js";
import { errInstallFailed, makeAppError } from "../../app-error/index.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import { appendWarningsToMessage } from "../../plan/job-step-message.js";
import type { Operation } from "../../plan/plan.js";
import type {
  JobStepArtifact,
  JobStepArtifactSource,
  JobStepArtifactTarget,
  JobStepResult,
} from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  trustedRegistryVersionForRef,
  trustRecordKey,
  validateRefTrustTransition,
} from "../../trust/index.js";
import {
  copyExtensionDirectory,
  formatCopyExtensionDirectoryFailure,
  sanitizeName,
} from "../../extensions/utils.js";
import type { InstallResult } from "./install-result.js";
import { computeSkillSourceHash } from "./source-hash.js";
import {
  capabilityRenderTargetForAgentId,
  materializeCapabilityTargetedBuild,
} from "../../capability-targeting/index.js";

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
  readonly existingInstalledAt: Option.Option<DateTime.Utc>;
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

export type InstallableSkillTarget = {
  readonly agentId: AgentId;
  readonly targetDir: string;
};

export type InstallableSkillTargetLocation = {
  readonly targetDir: string;
  readonly agentIds: ReadonlyArray<AgentId>;
};

const UNIVERSAL_AGENT_ID = "universal";

/**
 * A universal target sharing a directory with exactly one configured agent
 * adopts that agent's profile. Ambiguous multi-agent shared directories keep
 * the universal baseline because one path cannot truthfully hold two renders.
 */
export const renderTargetAgentIdForLocation = (agentIds: ReadonlyArray<AgentId>): AgentId => {
  const configured = agentIds.filter((agentId) => agentId !== UNIVERSAL_AGENT_ID);
  return configured.length === 1 ? (configured[0] ?? UNIVERSAL_AGENT_ID) : UNIVERSAL_AGENT_ID;
};

export const artifactAgentIdsFromTargets = (
  targets: ReadonlyArray<InstallableSkillTarget>,
): ReadonlyArray<string> =>
  Array.dedupe(
    targets.map((target) => target.agentId).filter((agentId) => agentId !== UNIVERSAL_AGENT_ID),
  );

export const artifactTargetAgentIds = (agentIds: ReadonlyArray<AgentId>): ReadonlyArray<string> =>
  agentIds.filter((agentId) => agentId !== UNIVERSAL_AGENT_ID);

const normalizedTargetDir = (path: Path.Path, targetDir: string): string =>
  stripTrailingSeparators(path.normalize(targetDir));

const targetLocationKey = (
  targetDir: string,
  workspaceRoot: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const normalizedDir = normalizedTargetDir(path, targetDir);
    const normalizedWorkspaceRoot = normalizedTargetDir(path, workspaceRoot);
    const realWorkspaceRoot = yield* fs.realPath(workspaceRoot).pipe(
      Effect.map((realPath) => normalizedTargetDir(path, realPath)),
      Effect.catch(() => Effect.succeed(normalizedWorkspaceRoot)),
    );

    if (
      isUniversalSkillsDir(normalizedDir, normalizedWorkspaceRoot) ||
      isUniversalSkillsDir(normalizedDir, realWorkspaceRoot)
    ) {
      return normalizedTargetDir(path, path.join(realWorkspaceRoot, UNIVERSAL_SKILLS_DIR));
    }

    const parentDir = path.dirname(normalizedDir);
    const realParentDir = yield* fs.realPath(parentDir).pipe(
      Effect.map((realPath) => normalizedTargetDir(path, realPath)),
      Effect.catch(() => Effect.succeed(parentDir)),
    );
    return normalizedTargetDir(path, path.join(realParentDir, path.basename(normalizedDir)));
  });

export const groupInstallTargetsByDirectory = (
  targets: ReadonlyArray<InstallableSkillTarget>,
  workspaceRoot: string,
): Effect.Effect<
  ReadonlyArray<InstallableSkillTargetLocation>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const keyedTargets = yield* Effect.forEach(
      targets,
      (target) =>
        targetLocationKey(target.targetDir, workspaceRoot).pipe(
          Effect.map((key) => ({ key, target })),
        ),
      { concurrency: "unbounded" },
    );
    const locationsByKey = new Map<string, { targetDir: string; agentIds: Array<AgentId> }>();
    for (const { key, target } of keyedTargets) {
      const existing = locationsByKey.get(key);
      if (existing === undefined) {
        locationsByKey.set(key, { targetDir: target.targetDir, agentIds: [target.agentId] });
        continue;
      }
      if (!existing.agentIds.includes(target.agentId)) {
        existing.agentIds.push(target.agentId);
      }
    }
    return [...locationsByKey.values()];
  });

export const skillArtifactFromTargets = (args: {
  readonly targets: ReadonlyArray<InstallableSkillTarget>;
  readonly workspaceRoot: string;
  readonly sanitizedName: string;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly workspaceTargets?: ReadonlyArray<JobStepArtifactTarget>;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const targetLocations = yield* groupInstallTargetsByDirectory(args.targets, args.workspaceRoot);
    const artifactTargets = [
      ...(args.workspaceTargets ?? []),
      ...targetLocations.map((location) => {
        const agentIds = artifactTargetAgentIds(location.agentIds);
        return {
          path: path.relative(
            args.workspaceRoot,
            path.join(location.targetDir, args.sanitizedName),
          ),
          change: args.change,
          ...(agentIds.length > 0 ? { agentIds } : {}),
        };
      }),
    ];
    const displayPath = artifactTargets[0]?.path ?? args.sanitizedName;
    const artifactAgents = artifactAgentIdsFromTargets(args.targets);
    return {
      path: displayPath,
      scope: args.scope,
      ...(artifactAgents.length > 0 ? { agents: artifactAgents } : {}),
      change: args.change,
      ...(artifactTargets.length > 0 ? { targets: artifactTargets } : {}),
    } satisfies JobStepArtifact;
  });

const countFiles = (dir: string): Effect.Effect<number, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed([])));
    let total = 0;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const statOption = yield* fs.stat(fullPath).pipe(Effect.option);
      if (Option.isNone(statOption)) continue;
      if (statOption.value.type === "Directory") {
        total += yield* countFiles(fullPath);
      } else {
        total += 1;
      }
    }
    return total;
  });

const expectedSkillSrcPath = (ref: SkillExtensionRef) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    switch (ref.refType) {
      case "registry": {
        const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
          refType: "registry",
          owner: ref.owner,
        });
        return skillSrcPath;
      }
      case "workspace": {
        const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
          refType: "workspace",
          owner: ref.owner,
        });
        return skillSrcPath;
      }
      case "git-hosted":
      case "local": {
        const { skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
          refType: ref.refType,
        });
        return skillSrcPath;
      }
    }
  });

const existingSourceHash = (ref: SkillExtensionRef) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const previousPath = yield* expectedSkillSrcPath(ref);
    const exists = yield* fs.exists(previousPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return undefined;
    return yield* computeSkillSourceHash(previousPath);
  });

const symlinkResultToChange = (
  result: "created" | "replaced" | "no-op" | "skipped",
): "created" | "updated" | "unchanged" => {
  switch (result) {
    case "created":
      return "created";
    case "replaced":
      return "updated";
    case "no-op":
    case "skipped":
      return "unchanged";
  }
};

const artifactChangeFromTargets = (
  fallback: JobStepArtifact["change"],
  targets: ReadonlyArray<{ readonly change?: JobStepArtifact["change"] }>,
): JobStepArtifact["change"] => {
  if (targets.length === 0) return fallback;
  if (targets.some((target) => target.change === "created")) return "created";
  if (targets.some((target) => target.change === "updated" || target.change === undefined)) {
    return "updated";
  }
  return fallback === "updated" ? "updated" : "unchanged";
};

const gitHostedSourceOrigin = (ref: GitHostedSkillRef): string => {
  const source = ref.source;
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "azurerepos":
      return `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`;
    case "git":
      return source.url.href;
  }
};

export const gitHostedSkillArtifactSource = (
  ref: SkillExtensionRef,
): JobStepArtifactSource | undefined => {
  if (ref.refType !== "git-hosted") return undefined;

  const gitTreeHash = Option.getOrUndefined(ref.gitTreeSha);
  const gitRef = Option.getOrUndefined(ref.source.ref);
  const directory =
    ref.sourcePath === undefined || ref.sourcePath.length === 0 ? "." : ref.sourcePath;

  return {
    type: ref.source.type,
    origin: gitHostedSourceOrigin(ref),
    ...(gitRef !== undefined ? { ref: gitRef } : {}),
    directory,
    ...(gitTreeHash !== undefined ? { gitTreeHash } : {}),
  };
};

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const preCleanAndCopy = (sanitizedName: string, sourcePath: string, copyTarget: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const sourceExists = yield* fs
      .exists(sourcePath)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!sourceExists) {
      return yield* errInstallFailed({
        message: formatCopyExtensionDirectoryFailure({
          sourcePath,
          targetPath: copyTarget,
          subject: "skill files",
          sourceExists,
        }),
      });
    }

    yield* removeFromAllCanonicalLocations(fs, ws.baseDir, "skills", sanitizedName, path);
    yield* copyExtensionDirectory(sourcePath, copyTarget).pipe(
      Effect.mapError((e) =>
        errInstallFailed({
          message: formatCopyExtensionDirectoryFailure({
            sourcePath,
            targetPath: copyTarget,
            subject: "skill files",
            sourceExists,
          }),
          cause: e,
        }),
      ),
    );
  });

const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

export { computeSkillSourceHash } from "./source-hash.js";

/**
 * Build a RenderedFilesMap from per-agent copy-mode install results.
 * Only includes agents where mode === "copy" and success === true.
 *
 * @internal Exported for testing only.
 */
export const buildRenderedFilesFromResults = (
  installableTargets: ReadonlyArray<{ agentId: AgentId; targetDir: string }>,
  agentResults: ReadonlyArray<InstallResult>,
  toWorkspaceRelativePath: (path: string) => string,
): RenderedFilesMap => {
  const result: Record<string, Array<{ path: RenderedFilePath }>> = {};
  for (const [target, installResult] of Array.zip(installableTargets, agentResults)) {
    if (installResult.mode === "copy" && installResult.success) {
      result[target.agentId] = [
        { path: decodeRenderedFilePath(toWorkspaceRelativePath(installResult.path)) },
      ];
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
  reuse: CanonicalReuseContext,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ws = yield* WorkspaceMutations;

    const { canonicalPath, skillSrcPath } = yield* ws.getSkillDir(ref.skill.name, {
      refType: "registry",
      owner: ref.owner,
    });
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: e,
        }),
      ),
    );
    const useExisting = shouldReuseCanonicalInstall({
      canonicalExists,
      force: reuse.force,
      hasIntegrity: Option.isSome(ref.integrity),
      refVersion: ref.version,
      lockedVersion: reuse.lockedVersion,
    });

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

const installFromWorkspace = (ref: WorkspaceSkillRef) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    if (ref.scope !== ws.scope) {
      return yield* makeAppError({
        code: "validation",
        detail: `Workspace skill ${ref.name} belongs to ${ref.scope} scope, not ${ws.scope} scope`,
      });
    }
    yield* validatePathSafety(ws.baseDir, ref.location);
    const skillSrcPath = path.join(ref.location, "src");
    const exists = yield* fs.exists(skillSrcPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect workspace skill source: ${skillSrcPath}`,
          cause: error,
        }),
      ),
    );
    if (!exists) {
      return yield* makeAppError({
        code: "validation",
        detail: `Workspace skill source is missing: ${skillSrcPath}`,
      });
    }
    return { skillSrcPath, versionRange: Option.none() } satisfies MaterializedSkill;
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
        change: "updated",
      } satisfies InstallResult;
    }

    // Try symlink, fall back to copy
    return yield* createSymlink({
      target: opts.canonicalSkillSrcPath,
      link: agentSkillPath,
    }).pipe(
      Effect.map(
        (result) =>
          ({
            success: true,
            mode: "symlink",
            symlinkFailed: false,
            error: Option.none(),
            path: agentSkillPath,
            canonicalPath: opts.canonicalSkillSrcPath,
            change: symlinkResultToChange(result),
          }) satisfies InstallResult,
      ),
      Effect.catch(() =>
        copyExtensionDirectory(opts.canonicalSkillSrcPath, agentSkillPath, {
          forAgentArtifact: true,
        }).pipe(
          Effect.map(
            () =>
              ({
                success: true,
                mode: "copy",
                symlinkFailed: true,
                error: Option.none(),
                path: agentSkillPath,
                canonicalPath: opts.canonicalSkillSrcPath,
                change: "updated",
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
              change: "updated",
            } satisfies InstallResult),
          ),
        ),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Dispatch helper
// -----------------------------------------------------------------------------

/** Reuse inputs sourced from the install operation and current lockfile. */
type CanonicalReuseContext = {
  readonly force: boolean;
  readonly lockedVersion: string | undefined;
};

const materializeSkill = (
  ref: SkillExtensionRef,
  sanitizedName: string,
  versionRange: Option.Option<string>,
  reuse: CanonicalReuseContext,
) => {
  switch (ref.refType) {
    case "git-hosted":
      return installFromGitHosted(ref, sanitizedName);
    case "registry":
      return installFromRegistry(ref, sanitizedName, versionRange, reuse);
    case "local":
      return installFromLocal(ref, sanitizedName);
    case "workspace":
      return installFromWorkspace(ref);
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
  | SourceHostProviders
  | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const { ref } = op.args;
    const sanitizedName = sanitizeName(ref.skill.name);
    const strictUnknownAgents = Option.getOrElse(op.args.strictUnknownAgents, () => false);
    const trustState = yield* ws.getTrustState();
    yield* validateRefTrustTransition(trustState, ref);
    const previousVersion = trustedRegistryVersionForRef(trustState, ref);
    const previouslyTrusted =
      trustState.records[trustRecordKey("skill", ref.skill.name)] !== undefined;
    const sourceHashBeforeInstall = yield* existingSourceHash(ref);

    // ── Per-refType: resolve source, copy to canonical ──────────────
    const materialized = yield* materializeSkill(ref, sanitizedName, op.args.versionRange, {
      force: op.args.force,
      lockedVersion: previousVersion,
    });

    // ── Shared: resolve agent targets + install once per distinct dir ────────
    const configuredAgents = yield* agentRepo
      .getMaterializationAgents()
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

    const unknownAgentWarning =
      unknownConfiguredAgentIds.length === 0
        ? undefined
        : `Skipping unknown configured agents: ${unknownConfiguredAgentIds.join(", ")}`;

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
    const skippedOutcomeWarning =
      skippedByOutcome.length === 0
        ? undefined
        : `Skipping non-installable configured agents: ${skippedByOutcome
            .map(({ agentId, outcome }) =>
              outcome._tag === "supported"
                ? `${agentId}: not skipped`
                : `${agentId}: ${outcome.reason}`,
            )
            .join(", ")}`;

    const installableTargets: Array<InstallableSkillTarget> = [];
    for (const { agentId, outcome } of resolvedAgents) {
      if (outcome._tag === "supported") {
        installableTargets.push({
          agentId,
          targetDir: path.normalize(outcome.dir),
        });
      }
    }
    const targetLocations = yield* groupInstallTargetsByDirectory(installableTargets, ws.baseDir);
    const displayTargetDir = targetLocations[0]?.targetDir;
    const perDirectoryResults = yield* Effect.forEach(
      targetLocations,
      (location) =>
        Effect.gen(function* () {
          const targetAgentId = renderTargetAgentIdForLocation(location.agentIds);
          const build = yield* materializeCapabilityTargetedBuild({
            baseDir: ws.baseDir,
            canonicalSourcePath: materialized.skillSrcPath,
            extensionName: sanitizedName,
            target: capabilityRenderTargetForAgentId(targetAgentId),
          }).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to render ${ref.skill.name} for ${targetAgentId}`,
                cause: error,
              }),
            ),
          );
          const result = yield* installForDirectory({
            targetDir: location.targetDir,
            canonicalSkillSrcPath: build.artifactSourcePath,
            sanitizedName,
          });
          return { location, result, build, targetAgentId };
        }),
      { concurrency: "unbounded" },
    );

    const agentResults: ReadonlyArray<InstallResult> = installableTargets.map((target) => {
      const matched = perDirectoryResults.find((item) =>
        item.location.agentIds.includes(target.agentId),
      );
      if (matched === undefined) {
        return {
          success: false,
          mode: "copy",
          symlinkFailed: true,
          error: Option.some(`No installation result for target directory ${target.targetDir}`),
          path: target.targetDir,
          canonicalPath: materialized.skillSrcPath,
          change: "updated",
        } satisfies InstallResult;
      }
      return matched.result;
    });
    // ── Shared: compute rendered files tracking for copy-mode ──────
    const renderWarnings: Array<string> = [];
    for (const { build, targetAgentId } of perDirectoryResults) {
      if (build.degraded) {
        const codes = Array.dedupe(build.findings.map((item) => item.code));
        renderWarnings.push(
          `Capability targeting for ${targetAgentId} used verbatim fallback: ${codes.join(", ")}`,
        );
      }
      const drift = build.findings.filter((item) => item.code === "rendered-artifact-drift");
      if (drift.length > 0) {
        renderWarnings.push(...drift.map((item) => item.message));
      }
    }
    const sourceHash =
      ref.refType === "workspace"
        ? ref.sourceHash
        : ref.refType === "registry"
          ? yield* computePackageContentHash(path.dirname(materialized.skillSrcPath))
          : yield* computeSkillSourceHash(materialized.skillSrcPath);

    // ── Shared: update lockfile + settings ──────────────────────────
    const workspaceRelativeLocalSourcePath =
      ref.refType === "local"
        ? makeWorkspaceRelativeSourcePath(path, ws.baseDir, ref.source.path)
        : Option.none();
    if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Local skill source path must stay within the workspace root: ${ref.source.path}`,
      });
    }
    const baseLockEntry = sourceToLockEntry({
      ref,
      now: yield* DateTime.now,
      sourceName: op.args.sourceName,
      existingInstalledAt: op.args.existingInstalledAt,
      workspaceRelativeLocalSourcePath,
    });
    const lockEntry = {
      ...baseLockEntry,
      sourceHash,
    };

    if (lockEntry.type === "registry") {
      yield* validateExactResolvedVersion(
        `skills.${ref.skill.name}.resolvedVersion`,
        lockEntry.resolvedVersion,
      );
    }

    // ── Shared: compute result ──────────────────────────────────────
    const anyFailed = agentResults.some((r) => !r.success);
    const fileCount = yield* countFiles(materialized.skillSrcPath);
    const currentSourceHash = yield* computeSkillSourceHash(materialized.skillSrcPath);
    const displayPath =
      displayTargetDir === undefined
        ? path.relative(ws.baseDir, materialized.skillSrcPath)
        : path.join(path.relative(ws.baseDir, displayTargetDir), sanitizedName);
    const artifactAgents = artifactAgentIdsFromTargets(installableTargets);
    const artifactTargets = perDirectoryResults.map(({ location, result }) => {
      const agentIds = artifactTargetAgentIds(location.agentIds);
      return {
        path: path.relative(ws.baseDir, result.path),
        change: result.change ?? "updated",
        ...(agentIds.length > 0 ? { agentIds } : {}),
      };
    });
    const version =
      lockEntry.type === "registry"
        ? lockEntry.resolvedVersion
        : Option.getOrUndefined(op.args.versionRange);
    const sameVersion = previousVersion === version;
    const sameSource = sourceHashBeforeInstall === currentSourceHash;
    const fallbackChange: JobStepArtifact["change"] = !previouslyTrusted
      ? "created"
      : sameVersion && sameSource
        ? "unchanged"
        : "updated";
    const artifactChange = artifactChangeFromTargets(fallbackChange, artifactTargets);

    if (anyFailed) {
      const failedAgents = agentResults
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

    const skillArgs = {
      name: ref.skill.name,
      lockEntry,
      versionRange: materialized.versionRange,
    };
    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setSkillLock(skillArgs)
      : ws.setSkill(skillArgs);
    const writeWarning = yield* writeEffect.pipe(
      Effect.as(undefined),
      Effect.catch((e) => Effect.succeed(`Skill update failed: ${String(e)}`)),
    );

    const warnings = [
      unknownAgentWarning,
      skippedOutcomeWarning,
      ...renderWarnings,
      writeWarning,
    ].filter((warning): warning is string => warning !== undefined);
    const sourceDetails = gitHostedSkillArtifactSource(ref);

    return {
      result: "success",
      message: appendWarningsToMessage(`Installed ${ref.skill.name}`, warnings),
      artifact: {
        path: displayPath.length === 0 ? "." : displayPath,
        scope: ws.scope,
        ...(artifactAgents.length > 0 ? { agents: artifactAgents } : {}),
        ...(version !== undefined ? { version } : {}),
        change: artifactChange,
        ...(previousVersion !== undefined && previousVersion !== version
          ? { previousVersion }
          : {}),
        fileCount,
        ...(artifactTargets.length > 0 ? { targets: artifactTargets } : {}),
        ...(sourceDetails !== undefined ? { source: sourceDetails } : {}),
      },
    } satisfies JobStepResult;
  });

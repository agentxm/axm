/**
 * Skill extension manager service.
 *
 * Implements ExtensionManager<SkillExtensionRef> with native/non-native
 * branching in materializeInstall and agent symlink creation for all
 * configured agents.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeCliError } from "../../cli-error/index.js";
import { CliEnvConfig } from "../../config/index.js";
import { sourceToLockEntry } from "../../sources/source-to-lock-entry.js";
import type { SkillExtensionRef } from "../../sources/types.js";
import type { SourceHostProvidersService } from "../../sources/index.js";
import { SourceHostProviders } from "../../sources/index.js";
import type {
  ExtensionManager,
  SkillExtensionTarget,
} from "../../workflows/install-operation/workflow.js";
import { Workspace } from "../../workspace/service.js";
import { sanitizeName } from "./utils.js";
import { computeSkillPaths, type SkillPathSource } from "./paths.js";
import { copySkillDirectory } from "./operations/copy-directory.js";
import { createSymlink } from "../../utils/create-symlink.js";
import { isPathSafe } from "../../utils/path-safety.js";
import { removeFromAllCanonicalLocations, stripFileProtocol } from "../../utils/fs-helpers.js";
import { DefaultCodingAgentRepository } from "../../agents/repository.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import { computeIntegrity } from "../../utils/integrity.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class SkillManager extends Context.Tag("@axm.sh/cli/SkillManager")<
  SkillManager,
  ExtensionManager<SkillExtensionRef>
>() {}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const validatePathSafety = (baseDir: string, targetPath: string) =>
  isPathSafe(baseDir, targetPath)
    ? Effect.void
    : makeCliError({
        code: "INSTALL_SKILL_PATH_TRAVERSAL",
        what: `Path traversal detected: ${targetPath}`,
      });

// Build skill lock entry from ref
const buildSkillLockEntry = (ref: SkillExtensionRef, agents: ReadonlyArray<string>) =>
  sourceToLockEntry({
    ref,
    agents,
    now: new Date(),
    sourceName: Option.none(),
  });

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const SkillManagerLive = Layer.effect(
  SkillManager,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const envConfig = yield* CliEnvConfig;
    const sources = yield* SourceHostProviders;
    const agents = yield* ws.getConfiguredAgents();
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path + CliEnvConfig to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(CliEnvConfig, envConfig),
    );

    // Provide FileSystem + Path + CliEnvConfig to an effect that needs them
    const provide = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | CliEnvConfig>,
    ): Effect.Effect<A, E, never> => Effect.provide(effect, fsPathLayer);

    const materializeInstall = ({ ref }: { readonly ref: SkillExtensionRef }) =>
      Effect.gen(function* () {
        const sanitized = sanitizeName(ref.skill.name);

        // Per-refType materialization producing the skillSrcPath
        const skillSrcPath = yield* materializeByRefType(
          ref,
          sanitized,
          fs,
          path,
          baseDir,
          sources,
          provide,
        );

        const configuredAgents = yield* DefaultCodingAgentRepository.getConfiguredAgents().pipe(
          Effect.provideService(Workspace, ws),
        );
        const resolved = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
              Effect.provide(fsPathLayer),
              Effect.map((outcome) => ({ agent, outcome })),
            ),
          { concurrency: "unbounded" },
        );

        const misconfigured = Array.filter(
          resolved,
          ({ outcome }) => outcome._tag === "misconfigured",
        );
        if (misconfigured.length > 0) {
          const details = misconfigured.map(({ agent, outcome }) =>
            outcome._tag === "misconfigured"
              ? `${agent.id}: ${outcome.reason}`
              : `${agent.id}: invalid configuration`,
          );
          return yield* makeCliError({
            code: "SKILL_DIR_MISCONFIGURED",
            what: "One or more configured agents have invalid skills directory settings",
            details,
          });
        }

        const installTargets = Array.filterMap(resolved, ({ outcome }) =>
          outcome._tag === "supported" ? Option.some(path.normalize(outcome.dir)) : Option.none(),
        );
        const distinctDirs = Array.dedupe(installTargets);

        yield* Effect.forEach(
          distinctDirs,
          (dir) => installForDirectory(skillSrcPath, dir, sanitized, path, baseDir, provide),
          { concurrency: "unbounded" },
        );
      }).pipe(Effect.withSpan("SkillManager.materializeInstall"));

    const materializeUninstall = ({ target }: { readonly target: SkillExtensionTarget }) =>
      Effect.gen(function* () {
        const sanitized = sanitizeName(target.name);

        const configuredAgents = yield* DefaultCodingAgentRepository.getConfiguredAgents().pipe(
          Effect.provideService(Workspace, ws),
        );
        const resolved = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
              Effect.provide(fsPathLayer),
              Effect.map((outcome) => ({ agent, outcome })),
            ),
          { concurrency: "unbounded" },
        );

        const distinctDirs = Array.dedupe(
          Array.filterMap(resolved, ({ outcome }) =>
            outcome._tag === "supported" ? Option.some(path.normalize(outcome.dir)) : Option.none(),
          ),
        );

        // Remove agent symlinks/copies concurrently from resolved directories
        yield* Effect.forEach(
          distinctDirs,
          (dir) => {
            const agentSkillPath = path.join(dir, sanitized);
            return fs
              .remove(agentSkillPath, { recursive: true })
              .pipe(Effect.catchAll(() => Effect.void));
          },
          { concurrency: "unbounded" },
        );

        // Remove from all canonical locations
        yield* removeFromAllCanonicalLocations(fs, baseDir, sanitized, path);
      }).pipe(Effect.withSpan("SkillManager.materializeUninstall"));

    return {
      extensionType: "skill",

      materializeInstall,
      materializeUninstall,

      upsertSettingsEntry: ({
        ref,
        versionConstraint,
      }: {
        readonly ref: SkillExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        const lockEntry = buildSkillLockEntry(ref, agents);
        if (lockEntry.type === "registry") {
          return validateExactResolvedVersion(
            `skills.${ref.skill.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          ).pipe(
            Effect.flatMap(() =>
              ws.setSkill({ name: ref.skill.name, lockEntry, versionConstraint }),
            ),
            Effect.withSpan("SkillManager.upsertSettingsEntry"),
          );
        }
        return ws
          .setSkill({ name: ref.skill.name, lockEntry, versionConstraint })
          .pipe(Effect.withSpan("SkillManager.upsertSettingsEntry"));
      },

      removeSettingsEntry: ({ target }: { readonly target: SkillExtensionTarget }) =>
        ws
          .removeSkillFromSettings(target.name)
          .pipe(Effect.withSpan("SkillManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: SkillExtensionRef }) => {
        const lockEntry = buildSkillLockEntry(ref, agents);
        if (lockEntry.type === "registry") {
          return validateExactResolvedVersion(
            `skills.${ref.skill.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          ).pipe(
            Effect.flatMap(() =>
              ws.setSkillLock({
                name: ref.skill.name,
                lockEntry,
                versionConstraint: Option.none(),
              }),
            ),
            Effect.withSpan("SkillManager.upsertLockfileEntry"),
          );
        }
        return ws
          .setSkillLock({
            name: ref.skill.name,
            lockEntry,
            versionConstraint: Option.none(),
          })
          .pipe(Effect.withSpan("SkillManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: SkillExtensionTarget }) =>
        ws.removeSkillLock(target.name).pipe(Effect.withSpan("SkillManager.removeLockfileEntry")),
    } satisfies ExtensionManager<SkillExtensionRef>;
  }),
);

// -----------------------------------------------------------------------------
// Internal materialization helpers
// -----------------------------------------------------------------------------

type ProvideFS = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | CliEnvConfig>,
) => Effect.Effect<A, E, never>;

const materializeByRefType = (
  ref: SkillExtensionRef,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  sources: SourceHostProvidersService,
  provide: ProvideFS,
): Effect.Effect<string, import("../../cli-error/index.js").CliError, never> => {
  switch (ref.refType) {
    case "git-hosted":
      return materializeGitHosted(ref, sanitizedName, fs, pathService, baseDir, provide);
    case "local":
      return materializeLocal(ref, sanitizedName, fs, pathService, baseDir, provide);
    case "builtin":
      return materializeBuiltin(ref, sanitizedName, fs, pathService, baseDir, sources, provide);
    case "registry":
      return materializeRegistry(ref, sanitizedName, fs, pathService, baseDir, provide);
  }
};

const preCleanAndCopy = (
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  sanitizedName: string,
  sourcePath: string,
  copyTarget: string,
  provide: ProvideFS,
) =>
  Effect.gen(function* () {
    yield* removeFromAllCanonicalLocations(fs, baseDir, sanitizedName, pathService);
    yield* provide(
      copySkillDirectory(sourcePath, copyTarget).pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "INSTALL_SKILL_COPY_FAILED",
            what: `Failed to copy skill files to ${copyTarget}`,
            cause: e,
          }),
        ),
      ),
    );
  });

const materializeGitHosted = (
  ref: Extract<SkillExtensionRef, { refType: "git-hosted" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFS,
) =>
  Effect.gen(function* () {
    const { skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      { refType: ref.refType },
      sanitizedName,
    );
    yield* validatePathSafety(baseDir, skillSrcPath);
    const sourcePath = stripFileProtocol(ref.location);
    yield* preCleanAndCopy(
      fs,
      pathService,
      baseDir,
      sanitizedName,
      sourcePath,
      skillSrcPath,
      provide,
    );
    return skillSrcPath;
  });

const materializeLocal = (
  ref: Extract<SkillExtensionRef, { refType: "local" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFS,
) =>
  Effect.gen(function* () {
    const { skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      { refType: ref.refType },
      sanitizedName,
    );
    yield* validatePathSafety(baseDir, skillSrcPath);
    const sourcePath = stripFileProtocol(ref.location);
    const isSelfCopy = pathService.resolve(sourcePath) === pathService.resolve(skillSrcPath);
    if (!isSelfCopy) {
      yield* preCleanAndCopy(
        fs,
        pathService,
        baseDir,
        sanitizedName,
        sourcePath,
        skillSrcPath,
        provide,
      );
    }
    return skillSrcPath;
  });

const materializeBuiltin = (
  ref: Extract<SkillExtensionRef, { refType: "builtin" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  sources: SourceHostProvidersService,
  provide: ProvideFS,
) =>
  Effect.gen(function* () {
    const { skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      { refType: ref.refType },
      sanitizedName,
    );
    yield* validatePathSafety(baseDir, skillSrcPath);
    const fetched = yield* sources.fetch(ref).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "INSTALL_SKILL_SOURCE_FETCH_FAILED",
          what: `Failed to fetch files for ${ref.skill.name}`,
          cause: error,
        }),
      ),
      Effect.scoped,
    );
    yield* preCleanAndCopy(
      fs,
      pathService,
      baseDir,
      sanitizedName,
      fetched.directory,
      skillSrcPath,
      provide,
    );
    return skillSrcPath;
  });

const materializeRegistry = (
  ref: Extract<SkillExtensionRef, { refType: "registry" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFS,
) =>
  Effect.gen(function* () {
    const source: SkillPathSource = { refType: "registry", namespace: ref.namespace };
    const { canonicalPath, skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      source,
      sanitizedName,
    );
    yield* validatePathSafety(baseDir, canonicalPath);

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
      const client = yield* provide(createRegistryClient(locationStr));
      const { archive } = yield* client.getExtensionPackage({
        namespace: ref.namespace,
        type: "skill",
        name: ref.name,
        version: Option.some(ref.version),
      });

      if (ref.integrity !== "") {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity) {
          return yield* makeCliError({
            code: "INSTALL_SKILL_INTEGRITY_MISMATCH",
            what: `Integrity mismatch for ${ref.name}@${ref.version}`,
            details: [`Expected ${ref.integrity}, got ${actualIntegrity}`],
          });
        }
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
          yield* provide(extractZip(archive, tmpDir));
          yield* preCleanAndCopy(
            fs,
            pathService,
            baseDir,
            sanitizedName,
            tmpDir,
            canonicalPath,
            provide,
          );
        }),
        fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
      );
    }

    return skillSrcPath;
  });

const installForDirectory = (
  canonicalSkillSrcPath: string,
  targetDir: string,
  sanitizedName: string,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFS,
) =>
  Effect.gen(function* () {
    const agentSkillPath = pathService.join(targetDir, sanitizedName);
    if (!isPathSafe(baseDir, agentSkillPath)) {
      return;
    }

    yield* provide(
      createSymlink({
        target: canonicalSkillSrcPath,
        link: agentSkillPath,
      }).pipe(
        Effect.catchAll(() =>
          copySkillDirectory(canonicalSkillSrcPath, agentSkillPath).pipe(Effect.ignore),
        ),
      ),
    );
  });

/**
 * Skill extension manager service.
 *
 * Implements ExtensionManager<SkillExtensionRef> with native/non-native
 * branching in materializeInstall and agent symlink creation for all
 * configured agents.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { type AppError, makeAppError } from "../app-error/index.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { sourceToLockEntry } from "../sources/index.js";
import type { SkillExtensionRef } from "./refs.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { ExtensionManager, SkillExtensionTarget } from "../workspace/service-interface.js";
import { Workspace } from "../workspace/service-interface.js";
import { computeSkillPaths, type SkillPathSource } from "./paths.js";
import { copyExtensionDirectory, sanitizeName } from "../extensions/utils.js";
import {
  computeIntegrity,
  createSymlink,
  isPathSafe,
  removeFromAllCanonicalLocations,
  stripFileProtocol,
} from "../utils/index.js";
import { CodingAgentRepository } from "../agents/index.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class SkillManager extends ServiceMap.Service<
  SkillManager,
  ExtensionManager<SkillExtensionRef>
>()("@axm.sh/cli/SkillManager") {}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const validatePathSafety = (baseDir: string, targetPath: string) =>
  isPathSafe(baseDir, targetPath)
    ? Effect.void
    : makeAppError({
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
    existingInstalledAt: Option.none(),
  });

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  skillName: string,
) =>
  Effect.gen(function* () {
    const sanitizedName = sanitizeName(skillName);

    const canonicalExists = yield* fsService
      .exists(pathService.join(baseDir, EXTERNAL_EXTENSIONS_DIR, "skills", sanitizedName))
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (canonicalExists) return true;

    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const skillPath = pathService.join(extensionsDir, scopeDir, "skills", sanitizedName);
        return fsService.exists(skillPath).pipe(Effect.catch(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
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
    const sources = yield* SourceHostProviders;
    const agentRepo = yield* CodingAgentRepository;
    const agents = yield* ws.getConfiguredAgents();
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // Provide FileSystem + Path to an effect that needs them
    const provide: ProvideFS = (effect) => Effect.provide(effect, fsPathLayer);

    const materializeInstall: ExtensionManager<SkillExtensionRef>["materializeInstall"] = Effect.fn(
      "SkillManager.materializeInstall",
    )(function* ({ ref }) {
      const sanitized = sanitizeName(ref.skill.name);

      const skillSrcPath = yield* materializeByRefType(
        ref,
        sanitized,
        fs,
        path,
        baseDir,
        sources,
        provide,
      );

      const configuredAgents = yield* agentRepo
        .getConfiguredAgents()
        .pipe(Effect.provideService(Workspace, ws));
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
        return yield* makeAppError({
          code: "SKILL_DIR_MISCONFIGURED",
          what: "One or more configured agents have invalid skills directory settings",
          details,
        });
      }

      const installTargets: Array<string> = [];
      for (const { outcome } of resolved) {
        if (outcome._tag === "supported") {
          installTargets.push(path.normalize(outcome.dir));
        }
      }
      const distinctDirs = Array.dedupe(installTargets);

      yield* Effect.forEach(
        distinctDirs,
        (dir) => installForDirectory(skillSrcPath, dir, sanitized, path, baseDir, provide),
        { concurrency: "unbounded" },
      );
    });

    const materializeUninstall: ExtensionManager<SkillExtensionRef>["materializeUninstall"] =
      Effect.fn("SkillManager.materializeUninstall")(function* ({ target }) {
        const sanitized = sanitizeName(target.name);

        const configuredAgents = yield* agentRepo
          .getConfiguredAgents()
          .pipe(Effect.provideService(Workspace, ws));
        const resolved = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
              Effect.provide(fsPathLayer),
              Effect.map((outcome) => ({ agent, outcome })),
            ),
          { concurrency: "unbounded" },
        );

        const uninstallTargets: Array<string> = [];
        for (const { outcome } of resolved) {
          if (outcome._tag === "supported") {
            uninstallTargets.push(path.normalize(outcome.dir));
          }
        }
        const distinctDirs = Array.dedupe(uninstallTargets);

        yield* Effect.forEach(
          distinctDirs,
          (dir) => {
            const agentSkillPath = path.join(dir, sanitized);
            return fs
              .remove(agentSkillPath, { recursive: true })
              .pipe(Effect.catch(() => Effect.void));
          },
          { concurrency: "unbounded" },
        );

        yield* removeFromAllCanonicalLocations(fs, baseDir, sanitized, path);
      });

    return {
      extensionType: "skill",
      isInstalled: Effect.fn("SkillManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: SkillExtensionTarget;
      }) {
        const installedSkills = yield* ws.getInstalledSkills();
        if (target.name in installedSkills) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),

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

type ProvideFS = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, Exclude<R, FileSystem.FileSystem | Path.Path>>;

const materializeByRefType = (
  ref: SkillExtensionRef,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  sources: SourceHostProvidersService,
  provide: ProvideFS,
): Effect.Effect<string, AppError, never> => {
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
      copyExtensionDirectory(sourcePath, copyTarget).pipe(
        Effect.mapError((e) =>
          makeAppError({
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
        makeAppError({
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
    const source: SkillPathSource = { refType: "registry", profile: ref.profile };
    const { canonicalPath, skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      source,
      sanitizedName,
    );
    yield* validatePathSafety(baseDir, canonicalPath);

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
      const client = yield* provide(createRegistryClient(locationStr));
      const { archive } = yield* client.getExtensionPackage({
        handle: ref.profile,
        type: "skill",
        name: ref.name,
        version: Option.some(ref.version),
      });

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
        Effect.catch(() =>
          copyExtensionDirectory(canonicalSkillSrcPath, agentSkillPath).pipe(Effect.ignore),
        ),
      ),
    );
  });

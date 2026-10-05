import { nativeAuthorityRoots } from "@agentxm/workspace-kernel/locations";
/**
 * Installing the official AXM skill that ships inside the CLI.
 *
 * The skill's content travels with the executable rather than a registry, so
 * the application supplies it through an asset port and the lifecycle decides
 * everything else: that an authored copy is never overwritten, that the
 * canonical directory is replaced atomically, that the entry is declared as
 * bundled with no accepted external resolution behind it, and that what ends
 * up installed is compatible with the CLI that installed it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  bundledSkillCanonicalRoot,
  AcceptedResolutionWriter,
  DesiredStateReader,
  LockfileReader,
  observeDesiredCanonical,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  type WorkspaceLayout,
  sanitizeName,
} from "@agentxm/workspace-kernel/workspace-state";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { groupInstallTargetsByDirectory } from "@agentxm/workspace-kernel/materialization";
import { ensureSkillAgentArtifact, inspectSkillAgentArtifact } from "../../materialization.js";
import {
  assessOfficialAxmSkill,
  selectOfficialAxmSkill,
} from "@agentxm/workspace-kernel/resolution";
import {
  AXM_SKILL_FQN,
  evaluateAxmSkillCompatibility,
  renderAxmSkillRecovery,
} from "@agentxm/cli-maintenance/official-skill/domain";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import { CodingAgentRepository } from "@agentxm/workspace-kernel/projection";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";

import {
  StepFailureConversion,
  type InstallStepRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  prepareCanonicalParents,
  replaceCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";

/** One file of the bundled skill's source tree. */
export interface BundledAxmSkillSourceFile {
  /** Path relative to the skill's `src` directory. */
  readonly path: string;
  readonly base64: string;
}

/**
 * The official skill as the running executable carries it, plus the version
 * of that executable. The generator that produces this belongs to the
 * application; the lifecycle only reads it.
 */
export interface BundledAxmSkillAssetService {
  readonly manifestJson: string;
  readonly version: string;
  readonly cliVersion: string;
  readonly cliVersionRange: string;
  readonly sourceFiles: ReadonlyArray<BundledAxmSkillSourceFile>;
  /** The CLI version this invocation is running. */
  readonly runningCliVersion: string;
}

export class BundledAxmSkillAsset extends ServiceMap.Service<
  BundledAxmSkillAsset,
  BundledAxmSkillAssetService
>()("@agentxm/extension-kinds/skills/lifecycle/BundledAxmSkillAsset") {}

const BUNDLED_AXM_SKILL_NAME = sanitizeName("axm");

export const BUNDLED_AXM_SKILL_AUTHORED_BLOCKER =
  "The official AXM skill is workspace-authored; bundled recovery will not overwrite its in-flight source.";

export type BundledAxmSkillReadiness =
  | { readonly readiness: "ready"; readonly canonicalPath: string }
  | {
      readonly readiness: "error";
      readonly canonicalPath: string;
      readonly errorMessage: string;
      readonly blocker: "authored" | "native-artifact";
    };

/** Where the bundled skill's canonical package sits. */
export const bundledAxmSkillCanonicalPath = (layout: WorkspaceLayout, path: Path.Path): string =>
  bundledSkillCanonicalRoot(path.join, layout, BUNDLED_AXM_SKILL_NAME);

/** Whether bundled recovery may write, or must preserve an authored copy. */
export const inspectBundledAxmSkillReadiness = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const settings = yield* SettingsReader;
  const path = yield* Path.Path;
  const configured = yield* settings.entries("skill");
  const existing = configured[BUNDLED_AXM_SKILL_NAME];
  const canonicalPath = bundledAxmSkillCanonicalPath(layout, path);
  if (existing?.source === "workspace" && existing.origin !== "bundled")
    return {
      readiness: "error",
      canonicalPath,
      errorMessage: BUNDLED_AXM_SKILL_AUTHORED_BLOCKER,
      blocker: "authored",
    } satisfies BundledAxmSkillReadiness;
  const agents = yield* (yield* CodingAgentRepository).getConfiguredAgents();
  for (const agent of agents) {
    const target = yield* agent.resolveEffectiveSkillsDir({
      workspaceRoot: location.baseDir,
      scope: location.scope,
    });
    if (target._tag === "misconfigured")
      return {
        readiness: "error",
        canonicalPath,
        errorMessage: `Agent ${agent.id} has invalid skills directory settings`,
        blocker: "native-artifact",
      } satisfies BundledAxmSkillReadiness;
    if (target._tag !== "supported") continue;
    const inspection = yield* inspectSkillAgentArtifact({
      nativeRoots: nativeAuthorityRoots(
        path,
        { workspaceRoot: location.baseDir, scope: location.scope },
        location.nativeDirectoryInputs,
      ),
      nativeInsertionEligible: existing === undefined,
      canonicalSkillSrcPath: path.join(canonicalPath, "src"),
      targetDir: target.dir,
      sanitizedName: BUNDLED_AXM_SKILL_NAME,
      baseDir: location.baseDir,
    }).pipe(Effect.result);
    if (inspection._tag === "Failure")
      return {
        readiness: "error",
        canonicalPath,
        errorMessage:
          "detail" in inspection.failure ? inspection.failure.detail : inspection.failure.message,
        blocker: "native-artifact",
      } satisfies BundledAxmSkillReadiness;
  }
  return { readiness: "ready", canonicalPath } satisfies BundledAxmSkillReadiness;
});

const writeFailed = (filePath: string) => (cause: unknown) =>
  installRefused({
    category: "internal",
    detail: `Failed to write bundled AXM skill file: ${filePath}`,
    cause,
  });

const materializeBundledAxmSkill = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const configuredBefore = yield* (yield* SettingsReader).entries("skill");
  const nativeInsertionEligible = configuredBefore[BUNDLED_AXM_SKILL_NAME] === undefined;
  const settingsWriter = yield* SettingsWriter;
  const accepted = yield* AcceptedResolutionWriter;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const asset = yield* BundledAxmSkillAsset;
  const canonicalPath = bundledAxmSkillCanonicalPath(layout, path);
  const skillSrcPath = path.join(canonicalPath, "src");

  yield* replaceCanonicalDirectory({
    baseDir: location.baseDir,
    canonicalPath,
    prepareParents: prepareCanonicalParents({
      canonicalPath,
      eligible: nativeInsertionEligible,
    }).pipe(
      Effect.mapError(writeFailed(canonicalPath)),
      Effect.map((record) => record.pipe(Effect.mapError(writeFailed(canonicalPath)))),
    ),
    populate: (stagingPath) => {
      const stagingSrcPath = path.join(stagingPath, "src");
      const skillJsonPath = path.join(stagingPath, "skill.json");
      return Effect.gen(function* () {
        yield* fs
          .makeDirectory(stagingSrcPath, { recursive: true })
          .pipe(Effect.mapError(writeFailed(stagingSrcPath)));
        yield* fs
          .writeFileString(skillJsonPath, asset.manifestJson)
          .pipe(Effect.mapError(writeFailed(skillJsonPath)));
        yield* Effect.forEach(
          asset.sourceFiles,
          (sourceFile) => {
            const destination = path.join(stagingSrcPath, sourceFile.path);
            return fs
              .makeDirectory(path.dirname(destination), { recursive: true })
              .pipe(
                Effect.andThen(fs.writeFile(destination, Buffer.from(sourceFile.base64, "base64"))),
                Effect.mapError(writeFailed(destination)),
              );
          },
          { concurrency: 16, discard: true },
        );
      });
    },
  });

  const configuredAgents = yield* agentRepo.getConfiguredAgents();
  const resolvedAgents = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent
        .resolveEffectiveSkillsDir({ workspaceRoot: location.baseDir, scope: location.scope })
        .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
    // eslint-disable-next-line axm-policy/no-unbounded-io -- configured agents are a subset of the fixed agent catalog
    { concurrency: "unbounded" },
  );
  const misconfigured = resolvedAgents.filter(({ outcome }) => outcome._tag === "misconfigured");
  if (misconfigured.length > 0) {
    return yield* installRefused({
      category: "validation",
      detail: "One or more configured agents have invalid skills directory settings",
    });
  }

  const distinctTargets = yield* groupInstallTargetsByDirectory(
    resolvedAgents.flatMap(({ agentId, outcome }) =>
      outcome._tag === "supported" ? [{ agentId, targetDir: outcome.dir }] : [],
    ),
    location.baseDir,
  );

  yield* Effect.forEach(
    distinctTargets,
    ({ targetDir }) =>
      ensureSkillAgentArtifact({
        nativeRoots: nativeAuthorityRoots(
          path,
          { workspaceRoot: location.baseDir, scope: location.scope },
          location.nativeDirectoryInputs,
        ),
        nativeInsertionEligible,
        canonicalSkillSrcPath: skillSrcPath,
        targetDir,
        sanitizedName: BUNDLED_AXM_SKILL_NAME,
        baseDir: location.baseDir,
      }),
    // eslint-disable-next-line axm-policy/no-unbounded-io -- distinct target directories come from the fixed agent catalog
    { concurrency: "unbounded" },
  );

  yield* settingsWriter.setEntry("skill", BUNDLED_AXM_SKILL_NAME, {
    source: "workspace",
    enabled: true,
    origin: "bundled",
  });
  yield* accepted.removeAccepted("skill", BUNDLED_AXM_SKILL_NAME);
});

/**
 * Install the embedded official AXM skill as one rollback-safe transition. It
 * runs its own transaction outside an operation boundary, so it declares only
 * what it reads and writes rather than a plan step's requirements.
 */
export const installBundledAxmSkill = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const desiredState = yield* DesiredStateReader;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const asset = yield* BundledAxmSkillAsset;
  const readiness = yield* inspectBundledAxmSkillReadiness.pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Bundled AXM skill readiness could not be inspected",
        cause,
      }),
    ),
  );
  if (readiness.readiness === "error") {
    return yield* installRefused({
      category: "conflict",
      detail: readiness.errorMessage,
      recover: "Preserve the conflicting artifact and inspect workspace ownership",
      cmd: "axm lint",
    });
  }
  const configuredAgents = yield* agentRepo.getConfiguredAgents().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured agents could not be read",
        cause,
      }),
    ),
  );
  const targetDirectories = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent
        .resolveEffectiveSkillsDir({ workspaceRoot: location.baseDir, scope: location.scope })
        .pipe(
          Effect.map((outcome) =>
            outcome._tag === "supported"
              ? [path.join(path.normalize(outcome.dir), BUNDLED_AXM_SKILL_NAME)]
              : [],
          ),
        ),
    // eslint-disable-next-line axm-policy/no-unbounded-io -- configured agents are a subset of the fixed agent catalog
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((paths) => paths.flat()),
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured skill placement could not be resolved",
        cause,
      }),
    ),
  );

  yield* runWorkspaceTransaction({
    targets: [
      readiness.canonicalPath,
      path.join(location.baseDir, ".agents/skills", BUNDLED_AXM_SKILL_NAME),
      ...targetDirectories,
    ],
    transition: materializeBundledAxmSkill,
    validate: () =>
      Effect.gen(function* () {
        const configured = yield* settings.entries("skill");
        const installedEntry = configured[BUNDLED_AXM_SKILL_NAME];
        if (installedEntry?.source !== "workspace" || installedEntry.origin !== "bundled") {
          return yield* installRefused({
            category: "internal",
            detail: "Bundled AXM skill did not retain its bundled source authority",
          });
        }
        const locked = yield* lockfile.entry("skill", BUNDLED_AXM_SKILL_NAME);
        if (Option.isSome(locked)) {
          return yield* installRefused({
            category: "internal",
            detail: "Bundled AXM skill retained a superseded accepted external resolution",
          });
        }
        // What is on disk now decides: the desired state reread after the
        // transition selects the package, and its installed bytes must be the
        // bundled release this executable carries and compatible with it.
        const desired = (yield* desiredState.graph()).nodes;
        const observed = yield* Effect.forEach(
          desired.filter((node) => node.type === "skill" && node.name === BUNDLED_AXM_SKILL_NAME),
          observeDesiredCanonical,
        ).pipe(Effect.provideService(LockfileReader, lockfile));
        const selected = selectOfficialAxmSkill(observed);
        const assessment = yield* assessOfficialAxmSkill({
          selected,
          policy: {
            evaluate: ({ candidate }) =>
              evaluateAxmSkillCompatibility({
                cliVersion: asset.runningCliVersion,
                skill: candidate,
              }),
          },
        });
        if (
          Option.isNone(selected) ||
          selected.value.authority !== "bundled" ||
          selected.value.observation.status !== "usable" ||
          assessment._tag !== "assessed"
        ) {
          return yield* installRefused({
            category: "internal",
            detail: "Bundled AXM skill was not usable at its canonical location after installation",
          });
        }
        const compatibility = assessment.compatibility;
        if (compatibility.status === "incompatible") {
          const recovery = renderAxmSkillRecovery(compatibility.recovery);
          return yield* installRefused({
            category: "internal",
            detail:
              compatibility.detail ??
              "Bundled AXM skill remained incompatible after workspace installation",
            ...(recovery.nextAction === null ? {} : { cmd: recovery.nextAction }),
          });
        }
        if (compatibility.skillVersion !== asset.version) {
          return yield* installRefused({
            category: "internal",
            detail: `Bundled AXM skill installed ${compatibility.skillVersion ?? "an unversioned release"}, not the bundled ${asset.version}`,
          });
        }
      }),
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof ExtensionLifecycleFailed
        ? cause
        : installRefused({
            category: "internal",
            detail: "Bundled AXM skill installation did not complete",
            cause,
          }),
    ),
    Effect.asVoid,
  );
});

/**
 * The single closure a bundled install becomes: one step that replaces the
 * canonical package and declares it, refused up front when an authored copy
 * of the official skill is in flight.
 */
export const planBundledAxmSkillInstall: Effect.Effect<
  Plan<InstallStepRequirements | BundledAxmSkillAsset>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | StepFailureConversion
> = Effect.gen(function* () {
  const conversion = yield* StepFailureConversion;
  const location = yield* WorkspaceLocation;
  const readiness = yield* inspectBundledAxmSkillReadiness.pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Bundled AXM skill readiness could not be inspected",
        cause,
      }),
    ),
  );
  const artifact: JobStepArtifact = {
    path: readiness.canonicalPath,
    scope: location.scope,
    change: "updated",
  };
  const step: PlannedJobStep<InstallStepRequirements | BundledAxmSkillAsset> =
    readiness.readiness === "error"
      ? {
          key: `bundled-axm-skill-${readiness.blocker}`,
          readiness: "error",
          errorMessage: readiness.errorMessage,
          label: AXM_SKILL_FQN,
          artifact,
        }
      : {
          key: "bundled-axm-skill",
          readiness: "ready",
          label: AXM_SKILL_FQN,
          artifact,
          run: installBundledAxmSkill.pipe(
            Effect.mapError(conversion.toStepFailure),
            Effect.as({
              result: "success",
              message: "Installed the bundled AXM skill",
              artifact,
            } satisfies JobStepResult),
          ),
        };
  return {
    _tag: "Plan",
    name: "Install bundled AXM skill",
    description: Option.some("Install the embedded compatible official AXM skill"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "skill",
    ),
    failureSuggestions: [
      {
        description:
          "Preserve the conflicting artifact and inspect executable compatibility guidance",
        cmd: "axm help upgrade",
      },
    ],
    jobs: [{ concurrency: 1, steps: [step] }],
  } satisfies Plan<InstallStepRequirements | BundledAxmSkillAsset>;
});

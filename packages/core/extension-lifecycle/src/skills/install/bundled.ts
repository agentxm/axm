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

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  ensureSkillAgentArtifact,
  replaceCanonicalDirectory,
} from "@agentxm/extension-materialization";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  AXM_SKILL_FQN,
  evaluateAxmSkillCompatibility,
} from "@agentxm/extension-resolution";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { CodingAgentRepository } from "@agentxm/workspace-projection";
import { WorkspaceMutations, sanitizeName } from "@agentxm/workspace-state";
import { runWorkspaceTransaction } from "@agentxm/workspace-transactions";

import { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { installRefused, type InstallStepRequirements } from "../../install/vocabulary.js";

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
>()("@agentxm/extension-lifecycle/skills/BundledAxmSkillAsset") {}

const BUNDLED_AXM_SKILL_NAME = sanitizeName("axm");

export const BUNDLED_AXM_SKILL_AUTHORED_BLOCKER =
  "The official AXM skill is workspace-authored; bundled recovery will not overwrite its in-flight source.";

export type BundledAxmSkillReadiness =
  | { readonly readiness: "ready"; readonly canonicalPath: string }
  | {
      readonly readiness: "error";
      readonly canonicalPath: string;
      readonly errorMessage: string;
    };

/** Where the bundled skill's canonical package sits. */
export const bundledAxmSkillCanonicalPath = (
  ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>,
  path: Path.Path,
): string => path.join(ws.layout.acquiredRoot, "agentxm", "@agentxm", "skills", "axm");

/** Whether bundled recovery may write, or must preserve an authored copy. */
export const inspectBundledAxmSkillReadiness = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const configured = yield* ws.getConfiguredSkillEntries();
  const existing = configured[BUNDLED_AXM_SKILL_NAME];
  const canonicalPath = bundledAxmSkillCanonicalPath(ws, path);
  return existing?.source === "workspace" && existing.origin !== "bundled"
    ? ({
        readiness: "error",
        canonicalPath,
        errorMessage: BUNDLED_AXM_SKILL_AUTHORED_BLOCKER,
      } satisfies BundledAxmSkillReadiness)
    : ({ readiness: "ready", canonicalPath } satisfies BundledAxmSkillReadiness);
});

const writeFailed = (filePath: string) => (cause: unknown) =>
  installRefused({
    category: "internal",
    detail: `Failed to write bundled AXM skill file: ${filePath}`,
    cause,
  });

const materializeBundledAxmSkill = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const asset = yield* BundledAxmSkillAsset;
  const canonicalPath = bundledAxmSkillCanonicalPath(ws, path);
  const skillSrcPath = path.join(canonicalPath, "src");

  yield* replaceCanonicalDirectory({
    baseDir: ws.baseDir,
    canonicalPath,
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
          { concurrency: "unbounded", discard: true },
        );
      });
    },
  });

  const configuredAgents = yield* agentRepo.getConfiguredAgents();
  const resolvedAgents = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent
        .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
        .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
    { concurrency: "unbounded" },
  );
  const misconfigured = resolvedAgents.filter(({ outcome }) => outcome._tag === "misconfigured");
  if (misconfigured.length > 0) {
    return yield* installRefused({
      category: "validation",
      detail: "One or more configured agents have invalid skills directory settings",
    });
  }

  const distinctTargets = [
    ...new Set(
      resolvedAgents.flatMap(({ outcome }) =>
        outcome._tag === "supported" ? [path.normalize(outcome.dir)] : [],
      ),
    ),
  ];

  yield* Effect.forEach(
    distinctTargets,
    (targetDir) =>
      ensureSkillAgentArtifact({
        canonicalSkillSrcPath: skillSrcPath,
        targetDir,
        sanitizedName: BUNDLED_AXM_SKILL_NAME,
        baseDir: ws.baseDir,
      }),
    { concurrency: "unbounded" },
  );

  yield* ws.setSkillEntry(BUNDLED_AXM_SKILL_NAME, {
    source: "workspace",
    enabled: true,
    origin: "bundled",
  });
  yield* ws.removeSkillLock(BUNDLED_AXM_SKILL_NAME);
});

/** Install the embedded official AXM skill as one rollback-safe transition. */
export const installBundledAxmSkill: Effect.Effect<
  void,
  ExtensionLifecycleFailed,
  InstallStepRequirements | BundledAxmSkillAsset
> = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
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
      detail: BUNDLED_AXM_SKILL_AUTHORED_BLOCKER,
      recover: "Preserve the authored skill and inspect executable compatibility guidance",
      cmd: "axm help upgrade",
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
        .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
        .pipe(
          Effect.map((outcome) =>
            outcome._tag === "supported"
              ? [path.join(path.normalize(outcome.dir), BUNDLED_AXM_SKILL_NAME)]
              : [],
          ),
        ),
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
    targets: [readiness.canonicalPath, ...targetDirectories],
    transition: materializeBundledAxmSkill,
    validate: () =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredSkillEntries();
        const installedEntry = configured[BUNDLED_AXM_SKILL_NAME];
        if (installedEntry?.source !== "workspace" || installedEntry.origin !== "bundled") {
          return yield* installRefused({
            category: "internal",
            detail: "Bundled AXM skill did not retain its bundled source authority",
          });
        }
        const locked = yield* ws.getLockedSkill(BUNDLED_AXM_SKILL_NAME);
        if (Option.isSome(locked)) {
          return yield* installRefused({
            category: "internal",
            detail: "Bundled AXM skill retained a superseded accepted external resolution",
          });
        }
        // The installed skill must be usable by the executable that installed
        // it, so the same compatibility policy runs inside the transaction.
        const compatibility = evaluateAxmSkillCompatibility({
          cliVersion: asset.runningCliVersion,
          skill: {
            manifestVersion: asset.version,
            source: `bundled:@agentxm/skills/axm@${asset.version}`,
            metadata: {
              [AXM_SKILL_CLI_VERSION_METADATA_KEY]: asset.cliVersion,
              [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: asset.cliVersionRange,
            },
          },
        });
        if (compatibility.status === "incompatible") {
          return yield* installRefused({
            category: "internal",
            detail:
              compatibility.detail ??
              "Bundled AXM skill remained incompatible after workspace installation",
            ...(compatibility.recovery.nextAction === null
              ? {}
              : { cmd: compatibility.recovery.nextAction }),
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
  InstallStepRequirements
> = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
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
    scope: ws.scope,
    change: "updated",
  };
  const step: PlannedJobStep<InstallStepRequirements | BundledAxmSkillAsset> =
    readiness.readiness === "error"
      ? {
          key: "bundled-axm-skill-authored",
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
            Effect.mapError(lifecycleStepFailure),
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
        description: "Preserve the authored skill and inspect executable compatibility guidance",
        cmd: "axm help upgrade",
      },
    ],
    jobs: [{ concurrency: 1, steps: [step] }],
  } satisfies Plan<InstallStepRequirements | BundledAxmSkillAsset>;
});

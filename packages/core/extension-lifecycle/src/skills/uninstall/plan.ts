/**
 * Uninstalling skills.
 *
 * A skill's removal withdraws its projection from every configured agent's
 * skills directory as well as its canonical package, so the artifact names
 * both. What the removal actually settled — package removed, retained for a
 * pack, or already absent — comes from the settlement, not from its sentence.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  DesiredStateReader,
  LockfileReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type WorkspaceLayout,
  type WorkspaceLocationService,
} from "@agentxm/workspace/desired-state";

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  SkillManager,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
} from "@agentxm/workspace/materialization";
import { buildUninstallOperation } from "@agentxm/workspace/reconciliation";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/extension-sources";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type {
  JobStepArtifactTarget,
  Plan,
  PlannedJobStep,
} from "@agentxm/workspace/transitions/planning";
import { CodingAgentRepository } from "@agentxm/workspace/projection";
import {
  acquiredExtensionDisplayPathFromLockEntry,
  installedRowsByName,
  sanitizeName,
  type SkillExtensionTarget,
  type SkillLockEntry,
} from "@agentxm/workspace/desired-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { expandGlob } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import { lifecycleStepFailure } from "../../step-failure.js";
import {
  installRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
} from "../../install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "@agentxm/workspace/reconciliation";
import type { SkillUninstallIntent } from "../../uninstall/vocabulary.js";
import {
  workspaceAuthoredPath,
  workspaceCanonicalPath,
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../workspace-paths.js";

const skillSourceTarget = (
  location: WorkspaceLocationService,
  layout: WorkspaceLayout,
  path: Path.Path,
  configuredSource: Option.Option<string>,
  lockEntry: Option.Option<SkillLockEntry>,
  sanitizedName: string,
): JobStepArtifactTarget => {
  if (Option.isSome(configuredSource) && configuredSource.value === "workspace") {
    return {
      path: workspaceAuthoredPath(path, location, layout, "skill", sanitizedName),
      change: "unchanged",
    };
  }
  if (Option.isSome(lockEntry)) {
    const entry = lockEntry.value;
    return {
      path: acquiredExtensionDisplayPathFromLockEntry(
        workspaceCanonicalRoot(location.scope),
        entry,
        "skills",
        entry.workspaceName,
      ),
      change: "removed",
    };
  }
  return { path: workspaceCanonicalPath(location.scope, sanitizedName), change: "removed" };
};

/** Expand the selector against installed skills; a glob may match nothing. */
export const parseSkillUninstallRequest: (
  selector: string,
) => Effect.Effect<
  SkillUninstallIntent,
  ExtensionLifecycleFailed,
  InstallStepRequirements | ResolveInstallRequirements
> = Effect.fn("UninstallExtensions.parseSkillRequest")(function* (selector: string) {
  const records = yield* WorkspaceRecords;
  const installedSkills = yield* records.rows("skill").pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Installed skills could not be read",
        cause,
      }),
    ),
    Effect.map(installedRowsByName),
  );
  const installedNames = Object.keys(installedSkills);
  const matched = expandGlob(selector, installedNames);

  if (selector.includes("*") && matched.length === 0) {
    return { targets: [] } satisfies SkillUninstallIntent;
  }

  // An identifier nothing installed answers to still names one skill: its
  // extension name, never the fully qualified spelling as a name.
  const unresolvedName = (input: string) => {
    const fqn = parseExtensionFqnParts(input);
    return fqn?.type === "skill" ? fqn.name : input;
  };
  const names =
    matched.length > 0
      ? matched
      : [
          yield* resolveInstalledIdentifierNameOrInput({
            input: selector,
            resourceType: "skill",
          }).pipe(
            Effect.map((name) => (name === selector.trim() ? unresolvedName(name) : name)),
            Effect.mapError((cause) =>
              installRefused({
                category: "not_found",
                detail: `Skill "${selector}" could not be resolved`,
                cause,
              }),
            ),
          ),
        ];

  return {
    targets: names.map((name): SkillExtensionTarget => ({ type: "skill", name })),
  } satisfies SkillUninstallIntent;
});

/** The closures a settled skill removal becomes. */
export const planSkillUninstall: (
  intent: SkillUninstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | SkillManager | FileSystem.FileSystem | Path.Path
> = Effect.fn("UninstallExtensions.planSkills")(function* (intent: SkillUninstallIntent) {
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const desiredState = yield* DesiredStateReader;
  const lockfile = yield* LockfileReader;
  const skillManager = yield* SkillManager;
  const agentRepo = yield* CodingAgentRepository;
  const path = yield* Path.Path;
  const retentionPolicy = makeWorkspaceRetentionPolicy(desiredState, lifecycleStepFailure);

  const configuredAgents = yield* agentRepo.getMaterializationAgents().pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured agents could not be read",
        cause,
      }),
    ),
  );
  const resolvedAgents = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent
        .resolveEffectiveSkillsDir({ workspaceRoot: location.baseDir })
        .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: "Configured skill placement could not be resolved",
        cause,
      }),
    ),
  );
  const installableTargets: Array<InstallableSkillTarget> = [];
  for (const { agentId, outcome } of resolvedAgents) {
    if (outcome._tag === "supported") {
      installableTargets.push({ agentId, targetDir: path.normalize(outcome.dir) });
    }
  }

  const steps = yield* Effect.forEach(
    intent.targets,
    (target) =>
      Effect.gen(function* () {
        const sanitizedName = sanitizeName(target.name);
        const configuredSource =
          skillManager.getConfiguredSource === undefined
            ? Option.none<string>()
            : yield* skillManager.getConfiguredSource({ target });
        const lockEntry = yield* lockfile
          .entry("skill", target.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        const sourceTarget = skillSourceTarget(
          location,
          layout,
          path,
          configuredSource,
          lockEntry,
          sanitizedName,
        );
        const removedArtifact = yield* skillArtifactFromTargets({
          targets: installableTargets,
          workspaceRoot: location.baseDir,
          sanitizedName,
          scope: location.scope,
          change: "removed",
          workspaceTargets: [
            { path: workspaceLockfilePath(location.scope), change: "updated" },
            { path: workspaceSettingsPath(location.scope), change: "updated" },
            sourceTarget,
          ],
        });
        // A skill another desired route still reaches keeps its resolution,
        // its package, and its projections: only the direct declaration goes.
        const retainedArtifact = yield* skillArtifactFromTargets({
          targets: installableTargets,
          workspaceRoot: location.baseDir,
          sanitizedName,
          scope: location.scope,
          change: "unchanged",
          workspaceTargets: [
            { path: workspaceLockfilePath(location.scope), change: "unchanged" },
            { path: workspaceSettingsPath(location.scope), change: "updated" },
            { path: sourceTarget.path, change: "unchanged" },
          ],
        });

        const step = buildUninstallOperation(skillManager, retentionPolicy, {
          target,
          toStepFailure: lifecycleStepFailure,
          // The settlement says what the removal withdrew, so a package
          // retained for a pack — or one that was never there — is reported
          // from the settlement rather than read out of a sentence.
          buildArtifact: ({ settlement }) => {
            if (settlement.declaration === "absent") {
              return Effect.succeed({ ...removedArtifact, change: "unchanged" as const });
            }
            if (
              settlement.canonical === "retained-by-pack" ||
              settlement.canonical === "preserved-unreadable"
            ) {
              // The declaration was withdrawn, so this changed the workspace
              // even though nothing on disk was deleted.
              return Effect.succeed({ ...retainedArtifact, change: "updated" as const });
            }
            return Effect.succeed(removedArtifact);
          },
        });
        return {
          ...step,
          artifact: removedArtifact,
        } satisfies PlannedJobStep<InstallStepRequirements>;
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Skill uninstall planning failed for ${target.name}`,
            cause,
          }),
        ),
      ),
    { concurrency: "unbounded" },
  );

  return {
    _tag: "Plan",
    name:
      intent.targets.length === 0
        ? "Uninstall skills"
        : intent.targets.length === 1
          ? "Uninstall skill"
          : `Uninstall ${intent.targets.length} skills`,
    description: Option.none(),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});

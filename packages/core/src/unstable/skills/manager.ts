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
import { makeAppError } from "../app-error/index.js";
import { sourceToLockEntry } from "../sources/index.js";
import type { SkillExtensionRef } from "./refs.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import type { ExtensionManager, SkillExtensionTarget } from "../workspace/service-interface.js";
import { Workspace } from "../workspace/service-interface.js";
import { existsInAnyCanonicalLocation } from "./disk-check.js";
import { sanitizeName } from "../extensions/utils.js";
import { removeFromAllCanonicalLocations } from "../utils/index.js";
import { CodingAgentRepository } from "../agents/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import {
  ensureSkillAgentArtifact,
  materializeSkillCanonical,
  removeSkillAgentArtifact,
  type ProvideFs,
} from "./materialization.js";

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

// Build skill lock entry from ref
const buildSkillLockEntry = (ref: SkillExtensionRef, agents: ReadonlyArray<string>) =>
  sourceToLockEntry({
    ref,
    agents,
    now: new Date(),
    sourceName: Option.none(),
    existingInstalledAt: Option.none(),
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
    const provide: ProvideFs = (effect) => Effect.provide(effect, fsPathLayer);

    const materializeInstall: ExtensionManager<SkillExtensionRef>["materializeInstall"] = Effect.fn(
      "SkillManager.materializeInstall",
    )(function* ({ ref }) {
      const sanitized = sanitizeName(ref.skill.name);

      const skillSrcPath = yield* materializeSkillCanonical({
        ref,
        sanitizedName: sanitized,
        fs,
        pathService: path,
        baseDir,
        sources,
        provide,
      });

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
        (dir) =>
          ensureSkillAgentArtifact({
            canonicalSkillSrcPath: skillSrcPath,
            targetDir: dir,
            sanitizedName: sanitized,
            pathService: path,
            baseDir,
            provide,
          }),
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
          (dir) =>
            removeSkillAgentArtifact({
              fs,
              pathService: path,
              targetDir: dir,
              sanitizedName: sanitized,
            }),
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

        return yield* existsInAnyCanonicalLocation(fs, path, baseDir, target.name);
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

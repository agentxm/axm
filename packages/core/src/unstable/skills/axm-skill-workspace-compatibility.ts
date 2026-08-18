import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { WorkspaceReadModel } from "../workspace/read-model/service.js";
import type { LockfileReadError, SettingsReadError } from "../workspace/read-model/errors.js";
import { parseSkillMd } from "./skill-content.js";
import {
  AXM_SKILL_FQN,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
  type AxmSkillCompatibilityPolicyService,
} from "./axm-skill-compatibility.js";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const manifestVersion = (content: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) return null;
    const version = parsed["version"];
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
};

const isOfficialSource = (source: string): boolean =>
  source === AXM_SKILL_FQN ||
  source.startsWith(`${AXM_SKILL_FQN}@`) ||
  source === `workspace:${AXM_SKILL_FQN}`;

export interface ReadAxmSkillWorkspaceCompatibilityArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspace: Pick<WorkspaceReadModel, "skills">;
  readonly policy: AxmSkillCompatibilityPolicyService;
}

/** Read and evaluate the authoritative installed AXM skill without mutating the workspace. */
export const readAxmSkillWorkspaceCompatibility = (
  args: ReadAxmSkillWorkspaceCompatibilityArgs,
): Effect.Effect<AxmSkillCompatibility, SettingsReadError | LockfileReadError> =>
  Effect.gen(function* () {
    const installed = yield* args.workspace.skills.byName("axm");
    if (Option.isNone(installed)) {
      const result = args.policy.evaluate({ fqn: AXM_SKILL_FQN, candidate: null });
      if (result === null) {
        return yield* Effect.die(
          "AXM compatibility policy did not evaluate the official AXM skill",
        );
      }
      return result;
    }

    const declaredEntry =
      installed.value.installationOrigin._tag === "direct"
        ? installed.value.installationOrigin.declared.entry
        : null;
    const source = declaredEntry?.source ?? null;
    if (source === null || !isOfficialSource(source)) {
      const result = args.policy.evaluate({ fqn: AXM_SKILL_FQN, candidate: null });
      if (result === null) {
        return yield* Effect.die(
          "AXM compatibility policy did not evaluate the official AXM skill",
        );
      }
      return result;
    }

    const actual = installed.value.actual.find((occurrence) => {
      if (occurrence.origin._tag !== "canonical-axm-skill") return false;
      if (occurrence.packageRoot === null) return false;
      const skillDirectory = occurrence.packageRoot;
      const skillsDirectory = args.platform.path.dirname(skillDirectory);
      const ownerDirectory = args.platform.path.dirname(skillsDirectory);
      return (
        args.platform.path.basename(skillDirectory) === "axm" &&
        args.platform.path.basename(skillsDirectory) === "skills" &&
        args.platform.path.basename(ownerDirectory) === "@agentxm"
      );
    });
    const manifestContent =
      actual?.packageRoot === null || actual?.packageRoot === undefined
        ? Option.none<string>()
        : yield* args.platform.fs
            .readFileString(args.platform.path.join(actual.packageRoot, "skill.json"))
            .pipe(Effect.option);
    const skillContent =
      actual?.sourcePath === null || actual?.sourcePath === undefined
        ? Option.none<string>()
        : yield* args.platform.fs.readFileString(actual.sourcePath).pipe(Effect.option);
    const skill = Option.flatMap(skillContent, (content) => parseSkillMd(content, "axm"));
    const installedManifestVersion = Option.match(manifestContent, {
      onNone: () => null,
      onSome: manifestVersion,
    });
    const candidate = {
      manifestVersion: installedManifestVersion,
      metadata: Option.match(skill, {
        onNone: () => null,
        onSome: (parsed) => Option.getOrNull(parsed.metadata),
      }),
      source:
        declaredEntry?.origin === "bundled"
          ? `bundled:${AXM_SKILL_FQN}${installedManifestVersion === null ? "" : `@${installedManifestVersion}`}`
          : source,
    } satisfies AxmSkillCompatibilityCandidate;

    const result = args.policy.evaluate({ fqn: AXM_SKILL_FQN, candidate });
    if (result === null) {
      return yield* Effect.die("AXM compatibility policy did not evaluate the official AXM skill");
    }
    return result;
  });

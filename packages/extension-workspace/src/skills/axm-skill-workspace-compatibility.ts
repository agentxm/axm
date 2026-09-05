import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { InstalledSkill, WorkspaceReadModel } from "@agentxm/workspace-state";
import {
  printSkillLockSourceLocator,
  type LockfileReadError,
  type SettingsReadError,
} from "@agentxm/workspace-state";
import { parseSkillMd } from "@agentxm/registry-protocol/unstable/content/skill-content";
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

const isOfficialSource = (source: string): boolean => {
  const registrySource = `agentxm:${AXM_SKILL_FQN}`;
  return (
    source === AXM_SKILL_FQN ||
    source.startsWith(`${AXM_SKILL_FQN}@`) ||
    source === registrySource ||
    source.startsWith(`${registrySource}@`) ||
    source === "workspace"
  );
};

const resolvesToOfficialAxmSkill = (installed: InstalledSkill): boolean =>
  Option.exists(installed.resolved, ({ lockEntry }) =>
    lockEntry.type === "registry"
      ? lockEntry.owner === "@agentxm" && lockEntry.name === "axm"
      : lockEntry.packageOwner === "@agentxm" && lockEntry.packageName === "axm",
  );

/** Whether desired workspace state directly or transitively declares the official AXM skill. */
export const declaresOfficialAxmSkill = (args: {
  readonly declaredSource: string | null;
  readonly installed: Option.Option<InstalledSkill>;
}): boolean =>
  (args.declaredSource !== null && isOfficialSource(args.declaredSource)) ||
  Option.exists(
    args.installed,
    (installed) =>
      installed.installationOrigin._tag === "pack-member" && resolvesToOfficialAxmSkill(installed),
  );

export interface ReadAxmSkillWorkspaceCompatibilityArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspace: Pick<WorkspaceReadModel, "scope" | "skills">;
  readonly policy: AxmSkillCompatibilityPolicyService;
}

/** Read and evaluate the authoritative installed AXM skill without mutating the workspace. */
export const readAxmSkillWorkspaceCompatibility = (
  args: ReadAxmSkillWorkspaceCompatibilityArgs,
): Effect.Effect<Option.Option<AxmSkillCompatibility>, SettingsReadError | LockfileReadError> =>
  Effect.gen(function* () {
    const declared = yield* args.workspace.skills.declaredByName("axm");
    const installed = yield* args.workspace.skills.byName("axm");
    const declaredSource = Option.match(declared, {
      onNone: () => null,
      onSome: ({ entry }) => entry.source,
    });
    if (!declaresOfficialAxmSkill({ declaredSource, installed })) {
      return Option.none();
    }

    if (Option.isNone(installed)) {
      const result = args.policy.evaluate({ fqn: AXM_SKILL_FQN, candidate: null });
      if (result === null) {
        return yield* Effect.die(
          "AXM compatibility policy did not evaluate the official AXM skill",
        );
      }
      return Option.some(result);
    }

    const installedSkill = installed.value;
    const declaredEntry =
      installedSkill.installationOrigin._tag === "direct"
        ? installedSkill.installationOrigin.declared.entry
        : null;
    const source =
      declaredEntry?.source ??
      Option.match(installedSkill.resolved, {
        onNone: () => null,
        onSome: ({ lockEntry }) => printSkillLockSourceLocator("axm", lockEntry),
      });

    const actual = installedSkill.actual.find((occurrence) => {
      if (occurrence.origin._tag !== "canonical-axm-skill") return false;
      if (occurrence.packageRoot === null) return false;
      const skillDirectory = occurrence.packageRoot;
      const skillsDirectory = args.platform.path.dirname(skillDirectory);
      const ownerDirectory = args.platform.path.dirname(skillsDirectory);
      const projectAuthored =
        args.platform.path.basename(skillDirectory) === "axm" &&
        args.platform.path.basename(skillsDirectory) === "skills";
      return args.workspace.scope === "project"
        ? projectAuthored
        : projectAuthored && args.platform.path.basename(ownerDirectory) === "@agentxm";
    });
    if (actual === undefined) {
      const result = args.policy.evaluate({ fqn: AXM_SKILL_FQN, candidate: null });
      if (result === null) {
        return yield* Effect.die(
          "AXM compatibility policy did not evaluate the official AXM skill",
        );
      }
      return Option.some(result);
    }
    const manifestContent =
      actual.packageRoot === null
        ? Option.none<string>()
        : yield* args.platform.fs
            .readFileString(args.platform.path.join(actual.packageRoot, "skill.json"))
            .pipe(Effect.option);
    const skillContent =
      actual.sourcePath === null
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
    return Option.some(result);
  });

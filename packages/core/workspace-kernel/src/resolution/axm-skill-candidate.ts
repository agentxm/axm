import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";
import {
  AxmSkillCompatibilityPolicy,
  AxmSkillCompatibilityUnavailable,
} from "@agentxm/cli-maintenance/official-skill/application";
import {
  AXM_SKILL_FQN,
  AxmSkillIncompatible,
  evaluateAxmSkillCompatibility,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
} from "@agentxm/cli-maintenance/official-skill/domain";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { parseSkillMd } from "@agentxm/extension-content";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

const parseManifest = (content: Option.Option<string>) =>
  Option.match(content, {
    onNone: () => ({ official: false, version: null }),
    onSome: (text) => {
      try {
        const value: unknown = JSON.parse(text);
        if (!Predicate.isReadonlyObject(value)) return { official: false, version: null };
        return {
          official:
            value["owner"] === "@agentxm" && value["type"] === "skill" && value["name"] === "axm",
          version: typeof value["version"] === "string" ? value["version"] : null,
        };
      } catch {
        return { official: false, version: null };
      }
    },
  });

const isKnownOfficialRef = (ref: SkillExtensionRef): boolean =>
  (ref.refType === "registry" || ref.refType === "workspace") &&
  ref.owner === "@agentxm" &&
  ref.name === "axm";

const sourceForRef = (ref: SkillExtensionRef): string => {
  switch (ref.refType) {
    case "registry":
      return `${ref.owner}/skills/${ref.name}@${ref.version}`;
    case "workspace":
      return `workspace:${ref.owner}/skills/${ref.name}`;
    case "http":
    case "git-hosted":
    case "local":
      return ref.location;
  }
};

export interface ValidateAxmSkillCandidateArgs {
  readonly ref: SkillExtensionRef;
  readonly packageRoot: string;
  readonly skillSourcePath: string;
}

/** The candidate's manifest and SKILL.md, each read once. */
const readAxmSkillCandidate = (args: ValidateAxmSkillCandidateArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const skillMdPath = path.join(args.skillSourcePath, "SKILL.md");
    const [manifestContent, skillMd] = yield* Effect.all([
      fs
        .readFileString(path.join(args.packageRoot, manifestFilenameForType("skill")))
        .pipe(Effect.option),
      fs.readFileString(skillMdPath).pipe(Effect.result),
    ]);
    return { manifestContent, skillMd: { path: skillMdPath, outcome: skillMd } };
  });

const evaluateAxmSkillCandidateRead = (
  args: ValidateAxmSkillCandidateArgs,
  read: Effect.Success<ReturnType<typeof readAxmSkillCandidate>>,
): Effect.Effect<AxmSkillCompatibility | null, AxmSkillCompatibilityUnavailable> =>
  Effect.gen(function* () {
    const manifest = parseManifest(read.manifestContent);
    if (!isKnownOfficialRef(args.ref) && !manifest.official) return null;

    const skillContent = Result.getSuccess(read.skillMd.outcome);
    const parsedSkill = Option.flatMap(skillContent, (content) => parseSkillMd(content, "axm"));
    const candidate = {
      manifestVersion: manifest.version,
      metadata: Option.match(parsedSkill, {
        onNone: () => null,
        onSome: (skill) => Option.getOrNull(skill.metadata),
      }),
      source: sourceForRef(args.ref),
      authority:
        args.ref.refType === "registry" || args.ref.refType === "workspace"
          ? args.ref.refType
          : null,
    } satisfies AxmSkillCompatibilityCandidate;
    const policy = yield* Effect.serviceOption(AxmSkillCompatibilityPolicy);
    const result = Option.match(policy, {
      onNone: () => evaluateAxmSkillCompatibility({ cliVersion: null, skill: candidate }),
      onSome: (service) => service.evaluate({ fqn: AXM_SKILL_FQN, candidate }),
    });
    if (result === null) {
      return yield* new AxmSkillCompatibilityUnavailable();
    }
    return result;
  });

/** Inspect candidate bytes and evaluate official AXM skill compatibility. */
export const evaluateAxmSkillCandidate = (
  args: ValidateAxmSkillCandidateArgs,
): Effect.Effect<
  AxmSkillCompatibility | null,
  AxmSkillCompatibilityUnavailable,
  FileSystem.FileSystem | Path.Path
> =>
  readAxmSkillCandidate(args).pipe(
    Effect.flatMap((read) => evaluateAxmSkillCandidateRead(args, read)),
  );

const refuseIncompatible = (
  result: AxmSkillCompatibility | null,
): Effect.Effect<AxmSkillCompatibility | null, AxmSkillIncompatible> =>
  result !== null && result.status === "incompatible"
    ? Effect.fail(new AxmSkillIncompatible({ compatibility: result }))
    : Effect.succeed(result);

/** Validate official AXM skill bytes before any workspace state is changed. */
export const validateAxmSkillCandidate = (
  args: ValidateAxmSkillCandidateArgs,
): Effect.Effect<
  AxmSkillCompatibility | null,
  AxmSkillCompatibilityUnavailable | AxmSkillIncompatible,
  FileSystem.FileSystem | Path.Path
> => evaluateAxmSkillCandidate(args).pipe(Effect.flatMap(refuseIncompatible));

/**
 * Validate as `validateAxmSkillCandidate` does, and return the outcome of the
 * one SKILL.md read the check made, with the path it read, so the caller can
 * derive the skill's native name from the same bytes before anything is
 * written. The outcome is the read's own content or failure.
 */
export const validateAxmSkillCandidateReadingSkillMd = (args: ValidateAxmSkillCandidateArgs) =>
  Effect.gen(function* () {
    const read = yield* readAxmSkillCandidate(args);
    const compatibility = yield* evaluateAxmSkillCandidateRead(args, read).pipe(
      Effect.flatMap(refuseIncompatible),
    );
    return { compatibility, skillMd: read.skillMd };
  });

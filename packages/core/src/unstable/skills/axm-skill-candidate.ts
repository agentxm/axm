import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  AXM_SKILL_FQN,
  AxmSkillCompatibilityPolicy,
  evaluateAxmSkillCompatibility,
  formatAxmSkillCompatibilityTarget,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
} from "./axm-skill-compatibility.js";
import type { SkillExtensionRef } from "./refs.js";
import { parseSkillMd } from "./skill-content.js";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseManifest = (content: Option.Option<string>) =>
  Option.match(content, {
    onNone: () => ({ official: false, version: null }),
    onSome: (text) => {
      try {
        const value: unknown = JSON.parse(text);
        if (!isRecord(value)) return { official: false, version: null };
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

/** Inspect candidate bytes and evaluate official AXM skill compatibility. */
export const evaluateAxmSkillCandidate = (
  args: ValidateAxmSkillCandidateArgs,
): Effect.Effect<AxmSkillCompatibility | null, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const [manifestContent, skillContent] = yield* Effect.all([
      fs.readFileString(path.join(args.packageRoot, "skill.json")).pipe(Effect.option),
      fs.readFileString(path.join(args.skillSourcePath, "SKILL.md")).pipe(Effect.option),
    ]);
    const manifest = parseManifest(manifestContent);
    if (!isKnownOfficialRef(args.ref) && !manifest.official) return null;

    const parsedSkill = Option.flatMap(skillContent, (content) => parseSkillMd(content, "axm"));
    const candidate = {
      manifestVersion: manifest.version,
      metadata: Option.match(parsedSkill, {
        onNone: () => null,
        onSome: (skill) => Option.getOrNull(skill.metadata),
      }),
      source: sourceForRef(args.ref),
    } satisfies AxmSkillCompatibilityCandidate;
    const policy = yield* Effect.serviceOption(AxmSkillCompatibilityPolicy);
    const result = Option.match(policy, {
      onNone: () => evaluateAxmSkillCompatibility({ cliVersion: null, skill: candidate }),
      onSome: (service) => service.evaluate({ fqn: AXM_SKILL_FQN, candidate }),
    });
    if (result === null) {
      return yield* makeAppError({
        code: "internal",
        detail: "AXM compatibility policy did not evaluate the official AXM skill",
      });
    }
    return result;
  });

/** Validate official AXM skill bytes before any workspace state is changed. */
export const validateAxmSkillCandidate = (
  args: ValidateAxmSkillCandidateArgs,
): Effect.Effect<AxmSkillCompatibility | null, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const result = yield* evaluateAxmSkillCandidate(args);
    if (result === null) return null;
    if (result.status === "incompatible") {
      return yield* makeAppError({
        code: "conflict",
        detail: result.detail ?? "The official AXM skill is incompatible with this AXM CLI.",
        recover: `Converge to ${formatAxmSkillCompatibilityTarget(result.recovery)} with the ${result.recovery.action} recovery plan`,
        ...(result.recovery.nextAction === null ? {} : { cmd: result.recovery.nextAction }),
      });
    }
    return result;
  });

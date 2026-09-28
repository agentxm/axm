import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import type { PlatformError } from "effect/PlatformError";
import type {
  CanonicalObservation,
  CanonicalObservationStatus,
  DesiredExtensionNode,
} from "../workspace-state/index.js";
import { parseSkillMd } from "@agentxm/extension-content";
import {
  AXM_SKILL_FQN,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
  type AxmSkillSourceAuthority,
} from "@agentxm/cli-maintenance/official-skill/domain";
import { type AxmSkillCompatibilityPolicyService } from "@agentxm/cli-maintenance/official-skill/application";

/** One desired node and the canonical observation workspace state made of it. */
export interface ObservedOfficialAxmSkillCandidate {
  readonly desired: DesiredExtensionNode;
  readonly observation: CanonicalObservation;
}

/** The desired official AXM skill, with the authority that selects its canonical package. */
export interface SelectedOfficialAxmSkill extends ObservedOfficialAxmSkillCandidate {
  readonly authority: AxmSkillSourceAuthority;
}

/**
 * What workspace state concludes about the official AXM skill. Declaration and
 * selected location are facts of their own: a declared skill whose canonical
 * state cannot be assessed stays declared.
 */
export type OfficialAxmSkillAssessment =
  | { readonly _tag: "undeclared" }
  | {
      /** The selected package, or its absence, judged by the compatibility policy. */
      readonly _tag: "assessed";
      readonly path: string | undefined;
      readonly authority: AxmSkillSourceAuthority;
      readonly compatibility: AxmSkillCompatibility;
    }
  | {
      /**
       * Settings or accepted state prevent selecting assessable content; the
       * canonical observation reports why.
       */
      readonly _tag: "canonical-state";
      readonly path: string | undefined;
      readonly authority: AxmSkillSourceAuthority;
      readonly status: CanonicalObservationStatus;
    }
  | {
      /** The selected package exists but its bytes could not be read. */
      readonly _tag: "unavailable";
      readonly path: string;
      readonly authority: AxmSkillSourceAuthority;
      readonly detail: string;
    };

const officialAuthority = (
  desired: DesiredExtensionNode,
): Option.Option<AxmSkillSourceAuthority> => {
  if (desired.type !== "skill" || desired.name !== "axm") return Option.none();
  const identity = desired.identity;
  switch (identity.authority) {
    case "registry":
    case "bundled":
    case "workspace":
      return identity.fqn === AXM_SKILL_FQN ? Option.some(identity.authority) : Option.none();
    case "git":
    case "path":
    case "inline":
      return Option.none();
  }
};

/**
 * The desired node that names the official AXM skill, whatever route declares
 * it. Content on disk never selects: only the desired graph's identity does.
 */
export const selectOfficialAxmSkill = (
  observed: ReadonlyArray<ObservedOfficialAxmSkillCandidate>,
): Option.Option<SelectedOfficialAxmSkill> => {
  for (const candidate of observed) {
    const authority = officialAuthority(candidate.desired);
    if (Option.isSome(authority)) return Option.some({ ...candidate, authority: authority.value });
  }
  return Option.none();
};

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

/** Read a file the selected package may lack; absence is a fact, other failures are not. */
const readOptional = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<Option.Option<string>, PlatformError> =>
  fs.readFileString(file).pipe(
    Effect.map(Option.some),
    Effect.catchIf(
      (error) => error.reason._tag === "NotFound",
      () => Effect.succeedNone,
    ),
  );

const sourceFor = (
  selected: SelectedOfficialAxmSkill,
  installedVersion: string | null,
): string | null => {
  const version = installedVersion === null ? "" : `@${installedVersion}`;
  switch (selected.authority) {
    case "bundled":
      return `bundled:${AXM_SKILL_FQN}${version}`;
    case "workspace":
      return "workspace";
    case "registry":
      return selected.desired.source ?? null;
  }
};

const evaluate = (
  policy: AxmSkillCompatibilityPolicyService,
  candidate: AxmSkillCompatibilityCandidate | null,
): Effect.Effect<AxmSkillCompatibility> => {
  const result = policy.evaluate({ fqn: AXM_SKILL_FQN, candidate });
  return result === null
    ? Effect.die("AXM compatibility policy did not evaluate the official AXM skill")
    : Effect.succeed(result);
};

/**
 * Assess the selected official AXM skill without mutating the workspace or
 * consulting a Registry. Only the selected canonical package's manifest and
 * entry document are read; other copies on disk never change the result.
 */
export const assessOfficialAxmSkill = (args: {
  readonly selected: Option.Option<SelectedOfficialAxmSkill>;
  readonly policy: AxmSkillCompatibilityPolicyService;
}): Effect.Effect<OfficialAxmSkillAssessment, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (Option.isNone(args.selected)) return { _tag: "undeclared" } as const;
    const selected = args.selected.value;
    const { observation, authority } = selected;
    switch (observation.status) {
      case "missing":
        return {
          _tag: "assessed",
          path: observation.path,
          authority,
          compatibility: yield* evaluate(args.policy, null),
        } as const;
      case "not-applicable":
      case "missing-resolution":
      case "wrong-origin":
      case "constraint-mismatch":
      case "materialization-mismatch":
        return {
          _tag: "canonical-state",
          path: observation.path,
          authority,
          status: observation.status,
        } as const;
      case "usable":
      case "corrupt":
      case "incomplete":
        break;
    }
    const root = observation.path;
    if (root === undefined) {
      return {
        _tag: "canonical-state",
        path: root,
        authority,
        status: observation.status,
      } as const;
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const read = yield* Effect.result(
      Effect.all([
        readOptional(fs, path.join(root, "skill.json")),
        readOptional(fs, path.join(root, "src", "SKILL.md")),
      ]),
    );
    if (Result.isFailure(read)) {
      return {
        _tag: "unavailable",
        path: root,
        authority,
        detail: read.failure.message,
      } as const;
    }
    const [manifestContent, skillContent] = read.success;
    const installedVersion = Option.match(manifestContent, {
      onNone: () => null,
      onSome: manifestVersion,
    });
    const skill = Option.flatMap(skillContent, (content) => parseSkillMd(content, "axm"));
    const candidate = {
      manifestVersion: installedVersion,
      metadata: Option.match(skill, {
        onNone: () => null,
        onSome: (parsed) => Option.getOrNull(parsed.metadata),
      }),
      source: sourceFor(selected, installedVersion),
      authority,
    } satisfies AxmSkillCompatibilityCandidate;
    return {
      _tag: "assessed",
      path: root,
      authority,
      compatibility: yield* evaluate(args.policy, candidate),
    } as const;
  });

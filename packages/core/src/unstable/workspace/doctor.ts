import * as Array from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { sanitizeName } from "../extensions/utils.js";
import {
  buildWorkspaceSkillState,
  isResolvedWorkspaceSkill,
  type WorkspaceSkillAgentState,
  type WorkspaceSkillState,
} from "./skill-state.js";

export type WorkspaceDoctorCheckStatus = "pass" | "warn" | "fail" | "skip";

export interface WorkspaceDoctorCheck {
  readonly name: string;
  readonly status: WorkspaceDoctorCheckStatus;
  readonly message: string;
  readonly hint?: string;
}

export interface WorkspaceDoctorDiagnosis {
  readonly checks: ReadonlyArray<WorkspaceDoctorCheck>;
  readonly passed: number;
  readonly warned: number;
  readonly failed: number;
  readonly skipped: number;
  readonly canSync: boolean;
}

const DOCTOR_CHECK_NAMES = {
  resolvable: "Skills Resolvable",
  installed: "Skills Installed",
  enabled: "Skills Enabled",
} as const;

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const formatNameList = (values: ReadonlyArray<string>, limit = 3) => {
  const shown = values.slice(0, limit);
  const suffix = values.length > limit ? `, +${values.length - limit} more` : "";
  return shown.join(", ") + suffix;
};

const summarizeChecks = (
  checks: ReadonlyArray<WorkspaceDoctorCheck>,
): WorkspaceDoctorDiagnosis => ({
  checks,
  passed: checks.filter((check) => check.status === "pass").length,
  warned: checks.filter((check) => check.status === "warn").length,
  failed: checks.filter((check) => check.status === "fail").length,
  skipped: checks.filter((check) => check.status === "skip").length,
  canSync: false,
});

const buildResolvableCheck = (skills: ReadonlyArray<WorkspaceSkillState>): WorkspaceDoctorCheck => {
  if (skills.length === 0) {
    return {
      name: DOCTOR_CHECK_NAMES.resolvable,
      status: "pass",
      message: "No skills are declared in settings.json.",
    };
  }

  const unresolved = skills.filter((skill) => skill._tag === "unresolved");
  if (unresolved.length === 0) {
    return {
      name: DOCTOR_CHECK_NAMES.resolvable,
      status: "pass",
      message: "All declared skills can be resolved from their configured sources.",
    };
  }

  return {
    name: DOCTOR_CHECK_NAMES.resolvable,
    status: "fail",
    message: `${pluralize(unresolved.length, "declared skill")} could not be resolved (${formatNameList(unresolved.map((skill) => skill.name))}).`,
    hint: "Fix the declared skill sources in settings.json before running `axm sync`.",
  };
};

const buildInstalledCheck = (
  skills: ReadonlyArray<WorkspaceSkillState>,
  resolvableCheck: WorkspaceDoctorCheck,
): WorkspaceDoctorCheck => {
  if (skills.length === 0) {
    return {
      name: DOCTOR_CHECK_NAMES.installed,
      status: "pass",
      message: "No skills are declared in settings.json.",
    };
  }

  if (resolvableCheck.status === "fail") {
    return {
      name: DOCTOR_CHECK_NAMES.installed,
      status: "skip",
      message: "Skipped because one or more declared skills could not be resolved.",
    };
  }

  const missing = skills.filter((skill) => isResolvedWorkspaceSkill(skill) && !skill.installed);

  if (missing.length === 0) {
    return {
      name: DOCTOR_CHECK_NAMES.installed,
      status: "pass",
      message: "All declared skills are installed in the workspace.",
    };
  }

  return {
    name: DOCTOR_CHECK_NAMES.installed,
    status: "fail",
    message: `${pluralize(missing.length, "declared skill")} ${missing.length === 1 ? "is" : "are"} not installed in the workspace (${formatNameList(missing.map((skill) => skill.name))}).`,
    hint: "Run `axm sync` to install missing skills into the workspace.",
  };
};

const buildEnabledCheck = (
  skills: ReadonlyArray<WorkspaceSkillState>,
  agentState: WorkspaceSkillAgentState,
  resolvableCheck: WorkspaceDoctorCheck,
  installedCheck: WorkspaceDoctorCheck,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<WorkspaceDoctorCheck, never> =>
  Effect.gen(function* () {
    if (skills.length === 0) {
      return {
        name: DOCTOR_CHECK_NAMES.enabled,
        status: "pass",
        message: "No skills are declared in settings.json.",
      } satisfies WorkspaceDoctorCheck;
    }

    if (resolvableCheck.status === "fail") {
      return {
        name: DOCTOR_CHECK_NAMES.enabled,
        status: "skip",
        message: "Skipped because one or more declared skills could not be resolved.",
      } satisfies WorkspaceDoctorCheck;
    }

    if (installedCheck.status === "fail") {
      return {
        name: DOCTOR_CHECK_NAMES.enabled,
        status: "skip",
        message: "Skipped because one or more declared skills are not installed.",
      } satisfies WorkspaceDoctorCheck;
    }

    if (agentState.supportedDirs.length === 0) {
      return agentState.issues.length === 0
        ? ({
            name: DOCTOR_CHECK_NAMES.enabled,
            status: "pass",
            message: "No configured agents need skill enablement.",
          } satisfies WorkspaceDoctorCheck)
        : ({
            name: DOCTOR_CHECK_NAMES.enabled,
            status: "warn",
            message: `No configured agent skills directories could be checked (${formatNameList(agentState.issues)}).`,
            hint: "Fix the configured agent setup or remove unsupported agents from settings.json.",
          } satisfies WorkspaceDoctorCheck);
    }

    const mismatches = yield* Effect.forEach(
      skills,
      (skill) => {
        if (!isResolvedWorkspaceSkill(skill)) {
          return Effect.succeed([]);
        }

        const artifactName = sanitizeName(skill.ref.skill.name);
        return Effect.forEach(
          agentState.supportedDirs,
          ({ agentId, dir }) =>
            fs.exists(path.join(dir, artifactName)).pipe(
              Effect.orElseSucceed(() => false),
              Effect.map((exists) => {
                if (skill.enabled && !exists) {
                  return Option.some(`${skill.name} -> ${agentId} missing`);
                }
                if (!skill.enabled && exists) {
                  return Option.some(`${skill.name} -> ${agentId} should be absent`);
                }
                return Option.none<string>();
              }),
            ),
          { concurrency: "unbounded" },
        ).pipe(Effect.map(Array.getSomes));
      },
      { concurrency: "unbounded" },
    ).pipe(Effect.map(Array.flatten));

    if (mismatches.length > 0) {
      return {
        name: DOCTOR_CHECK_NAMES.enabled,
        status: "fail",
        message: `${pluralize(mismatches.length, "skill enablement mismatch", "skill enablement mismatches")} were found (${formatNameList(mismatches)}).`,
        hint: "Run `axm sync` to reconcile enabled skill artifacts for configured agents.",
      } satisfies WorkspaceDoctorCheck;
    }

    if (agentState.issues.length > 0) {
      return {
        name: DOCTOR_CHECK_NAMES.enabled,
        status: "warn",
        message: `Enabled skills are correct for supported agents, but some configured agents could not be checked (${formatNameList(agentState.issues)}).`,
        hint: "Fix the configured agent setup or remove unsupported agents from settings.json.",
      } satisfies WorkspaceDoctorCheck;
    }

    return {
      name: DOCTOR_CHECK_NAMES.enabled,
      status: "pass",
      message: "Declared skill enablement matches the configured agents.",
    } satisfies WorkspaceDoctorCheck;
  });

export const diagnoseWorkspaceDoctor = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const state = yield* buildWorkspaceSkillState();

    const resolvableCheck = buildResolvableCheck(state.skills);
    const installedCheck = buildInstalledCheck(state.skills, resolvableCheck);
    const enabledCheck = yield* buildEnabledCheck(
      state.skills,
      state.agentState,
      resolvableCheck,
      installedCheck,
      fs,
      path,
    );

    const diagnosis = summarizeChecks([resolvableCheck, installedCheck, enabledCheck]);
    return {
      ...diagnosis,
      canSync: resolvableCheck.status === "pass",
    } satisfies WorkspaceDoctorDiagnosis;
  });

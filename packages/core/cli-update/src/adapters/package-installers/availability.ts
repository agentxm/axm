import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import type {
  CommandRecord,
  HomebrewFailure,
  InstallerAvailability,
  RegistryManagedInstallation,
} from "@agentxm/cli-maintenance/self-update/application";
import { HOMEBREW_FORMULA, NPM_PACKAGE } from "./commands.js";

const PublishedVersionSchema = Schema.Union([
  Schema.String,
  Schema.Struct({ type: Schema.String, data: Schema.String }),
]);

const parsePublishedVersion = (stdout: string): string | null => {
  const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(PublishedVersionSchema))(stdout);
  if (Option.isNone(decoded)) return null;
  const value = typeof decoded.value === "string" ? decoded.value : decoded.value.data;
  return semver.valid(value);
};

export const readPackageAvailability = (
  method: RegistryManagedInstallation,
  targetVersion: string,
  response: CommandRecord,
): InstallerAvailability => {
  if (response.executionState !== "exited") {
    return {
      state: "indeterminate",
      observedVersion: null,
      details: ["The owning package manager availability query did not complete."],
    } satisfies InstallerAvailability;
  }
  if (response.exitCode !== 0) {
    const error = Schema.decodeUnknownOption(
      Schema.fromJsonString(
        Schema.Struct({
          error: Schema.Struct({
            code: Schema.String,
            summary: Schema.optional(Schema.String),
            message: Schema.optional(Schema.String),
          }),
        }),
      ),
    )(response.stdout);
    const absent =
      Option.isSome(error) &&
      ((method._tag === "Npm" &&
        ["E404", "ETARGET"].includes(error.value.error.code) &&
        error.value.error.summary?.includes(`No match found for version ${targetVersion}`) ===
          true) ||
        (method._tag === "Pnpm" &&
          error.value.error.code === "ERR_PNPM_PACKAGE_NOT_FOUND" &&
          error.value.error.message?.includes(
            `No matching version found for ${NPM_PACKAGE}@${targetVersion}`,
          ) === true));
    return {
      state: absent ? "unavailable" : "indeterminate",
      observedVersion: null,
      details: [
        absent
          ? `The owning package manager does not expose AXM ${targetVersion}; retry after publication.`
          : `Availability of AXM ${targetVersion} could not be established; resolve the recorded package manager query failure before retrying.`,
      ],
    } satisfies InstallerAvailability;
  }
  if (method._tag === "Yarn") {
    const inventory = Schema.decodeUnknownOption(
      Schema.fromJsonString(
        Schema.Struct({
          type: Schema.Literal("inspect"),
          data: Schema.Array(Schema.String),
        }),
      ),
    )(response.stdout);
    if (
      Option.isNone(inventory) ||
      inventory.value.data.some((version) => semver.valid(version) === null)
    ) {
      return {
        state: "indeterminate",
        observedVersion: null,
        details: [
          `Yarn did not return a valid published version inventory for AXM ${targetVersion}; inspect the recorded query before retrying.`,
        ],
      } satisfies InstallerAvailability;
    }
    const available = inventory.value.data.includes(targetVersion);
    return {
      state: available ? "ready" : "unavailable",
      observedVersion: available ? targetVersion : null,
      details: available
        ? []
        : [`Yarn does not expose AXM ${targetVersion}; retry after publication.`],
    } satisfies InstallerAvailability;
  }

  const observedVersion = parsePublishedVersion(response.stdout);
  if (observedVersion === null) {
    return {
      state: "indeterminate",
      observedVersion: null,
      details: ["The owning package manager returned an invalid AXM version."],
    } satisfies InstallerAvailability;
  }

  const state = observedVersion === targetVersion ? "ready" : "indeterminate";
  return {
    state,
    observedVersion,
    details:
      state === "ready"
        ? []
        : [
            `The owning package manager advertises AXM ${observedVersion}; the canonical target is ${targetVersion}.`,
          ],
  } satisfies InstallerAvailability;
};

const HomebrewInfoSchema = Schema.Struct({
  formulae: Schema.Array(
    Schema.Struct({
      full_name: Schema.String,
      versions: Schema.Struct({ stable: Schema.String }),
    }),
  ),
});

interface HomebrewAvailability extends InstallerAvailability {
  readonly failure?: HomebrewFailure;
  readonly observedVersion: string | null;
  readonly details: ReadonlyArray<string>;
}

export const readHomebrewFormula = (
  query: CommandRecord,
  targetVersion: string,
): HomebrewAvailability => {
  const decoded =
    query.executionState === "exited" && query.exitCode === 0
      ? Schema.decodeUnknownOption(Schema.fromJsonString(HomebrewInfoSchema))(query.stdout)
      : Option.none();
  if (Option.isSome(decoded) && decoded.value.formulae.length === 0) {
    return {
      state: "unavailable",
      failure: "target-formula-unavailable",
      observedVersion: null,
      details: [
        `Homebrew does not expose the selected AXM ${targetVersion} formula; retry after publication.`,
      ],
    } satisfies HomebrewAvailability;
  }
  const formula =
    Option.isSome(decoded) && decoded.value.formulae.length === 1
      ? decoded.value.formulae[0]
      : undefined;
  const observedVersion =
    formula?.full_name === HOMEBREW_FORMULA ? semver.valid(formula.versions.stable) : null;
  if (observedVersion === null) {
    return {
      state: "indeterminate",
      failure: "formula-query-failed",
      observedVersion: null,
      details: [
        `Homebrew did not return a valid ${HOMEBREW_FORMULA} formula version after refresh.`,
        `Inspect the recorded brew info query, then retry after the query is healthy.`,
      ],
    } satisfies HomebrewAvailability;
  }
  const comparison = semver.compare(observedVersion, targetVersion);
  if (comparison === 0)
    return { state: "ready", observedVersion, details: [] } satisfies HomebrewAvailability;
  if (comparison > 0) {
    return {
      state: "leading",
      failure: "formula-ahead-of-target",
      observedVersion,
      details: [
        `Homebrew advertises AXM ${observedVersion}, which is newer than selected AXM ${targetVersion}.`,
        "The current formula cannot install this selected target; reconcile the formula and selected release before retrying.",
      ],
    } satisfies HomebrewAvailability;
  }
  return {
    state: "lagging",
    failure: "target-formula-unavailable",
    observedVersion,
    details: [
      `Homebrew advertises AXM ${observedVersion}; selected AXM ${targetVersion} is not yet available.`,
      "Retry after Homebrew formula publication completes.",
    ],
  } satisfies HomebrewAvailability;
};

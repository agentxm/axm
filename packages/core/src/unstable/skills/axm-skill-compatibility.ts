import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import * as semver from "semver";

export const AXM_SKILL_FQN = "@agentxm/skills/axm";
export const AXM_SKILL_CLI_VERSION_METADATA_KEY = "axm.sh/cli-version";
export const AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY = "axm.sh/cli-version-range";

export const AxmSkillCompatibilityReasonSchema = Schema.Literals([
  "cli-version-unavailable",
  "axm-skill-missing",
  "axm-skill-manifest-invalid",
  "compatibility-metadata-missing",
  "compatibility-metadata-malformed",
  "skill-release-mismatch",
  "skill-release-range-mismatch",
  "cli-version-incompatible",
] as const);
export type AxmSkillCompatibilityReason = typeof AxmSkillCompatibilityReasonSchema.Type;

export const AxmSkillCompatibilitySchema = Schema.Struct({
  status: Schema.Literals(["compatible", "incompatible"] as const),
  cliVersion: Schema.NullOr(Schema.String),
  skillVersion: Schema.NullOr(Schema.String),
  source: Schema.NullOr(Schema.String),
  declaredCliVersion: Schema.NullOr(Schema.String),
  declaredCliVersionRange: Schema.NullOr(Schema.String),
  reasonCode: Schema.NullOr(AxmSkillCompatibilityReasonSchema),
  detail: Schema.NullOr(Schema.String),
});
export type AxmSkillCompatibility = typeof AxmSkillCompatibilitySchema.Type;

export interface AxmSkillCompatibilityCandidate {
  readonly manifestVersion: string | null;
  readonly metadata: Readonly<Record<string, string>> | null;
  readonly source: string | null;
}

export interface AxmSkillCompatibilityInput {
  readonly cliVersion: string | null;
  readonly skill: AxmSkillCompatibilityCandidate | null;
}

export interface AxmSkillCompatibilityPolicyInput {
  readonly fqn: string;
  readonly candidate: AxmSkillCompatibilityCandidate | null;
}

export class AxmSkillCompatibilityPolicy extends ServiceMap.Service<
  AxmSkillCompatibilityPolicy,
  {
    readonly evaluate: (input: AxmSkillCompatibilityPolicyInput) => AxmSkillCompatibility | null;
  }
>()("@agentxm/client-core/unstable/skills/axm-skill-compatibility/AxmSkillCompatibilityPolicy") {}

export type AxmSkillCliVersionRangeValidation =
  { readonly valid: true } | { readonly valid: false };

const wildcardRangePattern = /(?:^|[.\s])(?:[xX*])(?:$|[.\s])/u;

const comparatorSetIsBounded = (comparators: ReadonlyArray<semver.Comparator>): boolean => {
  let hasLowerBound = false;
  let hasUpperBound = false;

  for (const comparator of comparators) {
    if (comparator.value.length === 0) continue;
    switch (comparator.operator) {
      case "":
        hasLowerBound = true;
        hasUpperBound = true;
        break;
      case ">":
      case ">=":
        hasLowerBound = true;
        break;
      case "<":
      case "<=":
        hasUpperBound = true;
        break;
    }
  }

  return hasLowerBound && hasUpperBound;
};

export const validateAxmSkillCliVersionRange = (
  value: string,
): AxmSkillCliVersionRangeValidation => {
  if (value.length === 0 || value.trim() !== value || wildcardRangePattern.test(value)) {
    return { valid: false };
  }
  if (semver.validRange(value) === null) return { valid: false };

  try {
    const range = new semver.Range(value);
    return range.set.length > 0 && range.set.every(comparatorSetIsBounded)
      ? { valid: true }
      : { valid: false };
  } catch {
    return { valid: false };
  }
};

interface CompatibilityFields {
  readonly cliVersion: string | null;
  readonly skillVersion: string | null;
  readonly source: string | null;
  readonly declaredCliVersion: string | null;
  readonly declaredCliVersionRange: string | null;
}

const incompatible = (
  fields: CompatibilityFields,
  reasonCode: AxmSkillCompatibilityReason,
  detail: string,
): AxmSkillCompatibility => ({
  status: "incompatible",
  ...fields,
  reasonCode,
  detail,
});

export const evaluateAxmSkillCompatibility = (
  input: AxmSkillCompatibilityInput,
): AxmSkillCompatibility => {
  const cliVersion = input.cliVersion === null ? null : semver.valid(input.cliVersion);
  const skillVersion = input.skill?.manifestVersion ?? null;
  const source = input.skill?.source ?? null;
  const declaredCliVersion = input.skill?.metadata?.[AXM_SKILL_CLI_VERSION_METADATA_KEY] ?? null;
  const declaredCliVersionRange =
    input.skill?.metadata?.[AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY] ?? null;
  const fields = {
    cliVersion,
    skillVersion,
    source,
    declaredCliVersion,
    declaredCliVersionRange,
  } satisfies CompatibilityFields;

  if (cliVersion === null) {
    return incompatible(
      fields,
      "cli-version-unavailable",
      "The running AXM CLI version is unavailable or invalid.",
    );
  }
  if (input.skill === null) {
    return incompatible(
      fields,
      "axm-skill-missing",
      "The official @agentxm/skills/axm skill is not installed.",
    );
  }
  const validSkillVersion =
    input.skill.manifestVersion === null ? null : semver.valid(input.skill.manifestVersion);
  if (validSkillVersion === null) {
    return incompatible(
      fields,
      "axm-skill-manifest-invalid",
      "The official AXM skill manifest has a missing or invalid version.",
    );
  }
  if (declaredCliVersion === null || declaredCliVersionRange === null) {
    return incompatible(
      fields,
      "compatibility-metadata-missing",
      `The official AXM skill must declare ${AXM_SKILL_CLI_VERSION_METADATA_KEY} and ${AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY}.`,
    );
  }
  if (
    semver.valid(declaredCliVersion) === null ||
    !validateAxmSkillCliVersionRange(declaredCliVersionRange).valid
  ) {
    return incompatible(
      fields,
      "compatibility-metadata-malformed",
      "The official AXM skill compatibility metadata must contain an exact release and a bounded, wildcard-free semver range.",
    );
  }
  if (validSkillVersion !== declaredCliVersion) {
    return incompatible(
      fields,
      "skill-release-mismatch",
      `The AXM skill manifest reports ${validSkillVersion}, but ${AXM_SKILL_CLI_VERSION_METADATA_KEY} reports ${declaredCliVersion}.`,
    );
  }
  if (!semver.satisfies(declaredCliVersion, declaredCliVersionRange)) {
    return incompatible(
      fields,
      "skill-release-range-mismatch",
      `The AXM skill release ${declaredCliVersion} is outside its declared CLI range ${declaredCliVersionRange}.`,
    );
  }
  if (!semver.satisfies(cliVersion, declaredCliVersionRange)) {
    return incompatible(
      fields,
      "cli-version-incompatible",
      `AXM CLI ${cliVersion} is outside the official AXM skill range ${declaredCliVersionRange}.`,
    );
  }

  return {
    status: "compatible",
    ...fields,
    reasonCode: null,
    detail: null,
  };
};

export const makeAxmSkillCompatibilityPolicyLayer = (
  cliVersion: string | null,
): Layer.Layer<AxmSkillCompatibilityPolicy> =>
  Layer.succeed(AxmSkillCompatibilityPolicy, {
    evaluate: (input) =>
      input.fqn === AXM_SKILL_FQN
        ? evaluateAxmSkillCompatibility({ cliVersion, skill: input.candidate })
        : null,
  });

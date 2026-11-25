import * as Option from "effect/Option";

import { parseSkillMd } from "@agentxm/extension-content";

import { validateReleaseVersion } from "./release-identity.js";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
} from "@agentxm/cli-maintenance/official-skill/domain";

export const AXM_SKILL_MANIFEST_PATH = "skills/axm/skill.json";
export const AXM_SKILL_DOCUMENT_PATH = "skills/axm/src/SKILL.md";
export const AXM_SKILL_GENERATED_PATH = "apps/cli/src/__generated__/bundled-axm-skill.ts";

export interface GeneratedAxmSkillCompatibility extends AxmSkillCompatibilityDeclaration {
  readonly version: string;
}

const readGeneratedStringConstant = (content: string, name: string, source: string): string => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^export const ${escapedName} = ("(?:[^"\\\\]|\\\\.)*");$`, "m").exec(
    content,
  );
  if (match?.[1] === undefined) throw new Error(`Missing ${name} in ${source}.`);

  const parsed: unknown = JSON.parse(match[1]);
  if (typeof parsed !== "string") throw new Error(`Expected ${name} to be a string in ${source}.`);
  return parsed;
};

export const readGeneratedSkillCompatibilityFromContent = (
  content: string,
  source: string,
): GeneratedAxmSkillCompatibility => ({
  version: readGeneratedStringConstant(content, "AXM_SKILL_VERSION", source),
  cliVersion: readGeneratedStringConstant(content, "AXM_SKILL_CLI_VERSION", source),
  cliVersionRange: readGeneratedStringConstant(content, "AXM_SKILL_CLI_VERSION_RANGE", source),
});

export interface AxmSkillCompatibilityDeclaration {
  readonly cliVersion: string;
  readonly cliVersionRange: string;
}

export const readSkillCompatibilityFromContent = (
  content: string,
  source: string,
): AxmSkillCompatibilityDeclaration => {
  const parsedSkill = Option.getOrNull(parseSkillMd(content, "axm"));
  if (parsedSkill === null) throw new Error(`Invalid AXM skill document in ${source}.`);

  const metadata = Option.getOrNull(parsedSkill.metadata);
  const cliVersion = metadata?.[AXM_SKILL_CLI_VERSION_METADATA_KEY];
  const cliVersionRange = metadata?.[AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY];
  if (cliVersion === undefined || cliVersionRange === undefined) {
    throw new Error(`Missing AXM skill compatibility declaration in ${source}.`);
  }

  return { cliVersion, cliVersionRange };
};

const replaceExactlyOnce = (
  content: string,
  pattern: RegExp,
  replacement: string,
  source: string,
): string => {
  const matches = content.match(pattern);
  if (matches?.length !== 1) {
    throw new Error(`Expected exactly one release stamp in ${source}.`);
  }

  return content.replace(pattern, replacement);
};

export const stampSkillManifestContent = (
  content: string,
  version: string,
  path: string = AXM_SKILL_MANIFEST_PATH,
) => {
  validateReleaseVersion(version);
  return replaceExactlyOnce(
    content,
    /^([ \t]*"version"[ \t]*:[ \t]*)"[^"]+"([ \t]*,?[ \t]*)$/gm,
    `$1"${version}"$2`,
    path,
  );
};

const requireCompatibleSkillDeclaration = (
  version: string,
  declaration: AxmSkillCompatibilityDeclaration,
  source: string,
): AxmSkillCompatibilityDeclaration => {
  const result = evaluateAxmSkillCompatibility({
    cliVersion: version,
    skill: {
      manifestVersion: version,
      metadata: {
        [AXM_SKILL_CLI_VERSION_METADATA_KEY]: declaration.cliVersion,
        [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: declaration.cliVersionRange,
      },
      source,
      // Release preparation checks the skill this repository authors.
      authority: "workspace",
    },
  });
  if (result.status !== "compatible") {
    throw new Error(
      `Incompatible AXM skill declaration in ${source}: ${result.reasonCode ?? "unknown"}: ${result.detail ?? "no detail"}`,
    );
  }
  return declaration;
};

/**
 * The release's minor band, e.g. `0.27.11` -> `>=0.27.0 <0.28.0`.
 *
 * An exact pin declares the skill compatible with exactly one CLI build, so
 * every patch release reports a false incompatibility in each workspace until
 * that workspace updates its installed skill. The band stays bounded and
 * wildcard-free, as `validateAxmSkillCliVersionRange` requires, while
 * tolerating patch drift within the minor.
 */
const minorBandRange = (version: string): string => {
  const match = /^(\d+)\.(\d+)\./.exec(version);
  const major = match?.[1];
  const minor = match?.[2];
  if (major === undefined || minor === undefined) {
    throw new Error(`Cannot derive a compatibility range from version: ${version}`);
  }
  return `>=${major}.${minor}.0 <${major}.${Number(minor) + 1}.0`;
};

/**
 * A managed minor band rolls forward when the release crosses that boundary.
 * Any other range is an intentional declaration and is preserved verbatim — the compatibility
 * guard then fails the release when it no longer covers the release version.
 */
export const transitionSkillCompatibility = (
  current: AxmSkillCompatibilityDeclaration,
  releaseVersion: string,
): AxmSkillCompatibilityDeclaration => {
  requireCompatibleSkillDeclaration(current.cliVersion, current, "current AXM skill");
  const currentMinorBand = minorBandRange(current.cliVersion);
  const next = {
    cliVersion: releaseVersion,
    cliVersionRange:
      current.cliVersionRange === currentMinorBand
        ? minorBandRange(releaseVersion)
        : current.cliVersionRange,
  } satisfies AxmSkillCompatibilityDeclaration;
  return requireCompatibleSkillDeclaration(releaseVersion, next, "next AXM skill");
};

export const stampSkillCompatibilityContent = (
  content: string,
  version: string,
  path: string = AXM_SKILL_DOCUMENT_PATH,
) => {
  validateReleaseVersion(version);
  const next = transitionSkillCompatibility(
    readSkillCompatibilityFromContent(content, path),
    version,
  );
  const withVersion = replaceExactlyOnce(
    content,
    /^[ \t]*axm\.sh\/cli-version:[ \t]*.+$/gm,
    `  ${AXM_SKILL_CLI_VERSION_METADATA_KEY}: "${next.cliVersion}"`,
    path,
  );
  return replaceExactlyOnce(
    withVersion,
    /^[ \t]*axm\.sh\/cli-version-range:[ \t]*.+$/gm,
    `  ${AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY}: "${next.cliVersionRange}"`,
    path,
  );
};

const requireMatchingVersions = (
  versions: ReadonlyArray<readonly [path: string, version: string]>,
  source: string,
): string => {
  const firstVersion = versions[0]?.[1];
  if (firstVersion === undefined) throw new Error(`No release packages configured for ${source}.`);
  const hasMismatch = versions.some(([, version]) => version !== firstVersion);

  if (hasMismatch) {
    const details = versions.map(([filePath, version]) => `${filePath}=${version}`).join(", ");
    throw new Error(`Version mismatch in ${source}: ${details}.`);
  }

  return firstVersion;
};

export const requireMatchingReleaseCompatibility = (
  versions: ReadonlyArray<readonly [path: string, version: string]>,
  declaration: AxmSkillCompatibilityDeclaration,
  generated: GeneratedAxmSkillCompatibility,
  source: string,
): string => {
  const version = requireMatchingVersions(versions, source);
  requireCompatibleSkillDeclaration(version, declaration, source);
  validateGeneratedSkillCompatibility(version, declaration, generated, source);

  return version;
};

export const validateGeneratedSkillCompatibility = (
  version: string,
  declaration: AxmSkillCompatibilityDeclaration,
  generated: GeneratedAxmSkillCompatibility,
  source: string,
): void => {
  if (
    generated.version !== version ||
    generated.cliVersion !== declaration.cliVersion ||
    generated.cliVersionRange !== declaration.cliVersionRange
  ) {
    throw new Error(
      `Generated AXM skill mismatch in ${source}: generated version=${generated.version}, cli-version=${generated.cliVersion}, cli-version-range=${generated.cliVersionRange}; canonical version=${version}, cli-version=${declaration.cliVersion}, cli-version-range=${declaration.cliVersionRange}.`,
    );
  }
};

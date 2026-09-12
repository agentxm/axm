import { validateReleaseVersion } from "./release-shared.js";

export const derivePreviewVersion = (input: {
  readonly base: string;
  readonly sequence: number;
  readonly shortSha: string;
}): string => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(input.base);
  if (match === null) {
    throw new Error(`Base version is not stable semver: ${input.base}`);
  }

  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`Base version has incomplete semver components: ${input.base}`);
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new Error("Preview sequence must be a positive integer.");
  }
  if (!/^[0-9a-f]{7,40}$/u.test(input.shortSha)) {
    throw new Error("Preview source must be a lowercase Git commit identity.");
  }

  return validateReleaseVersion(
    `${major}.${minor}.${patch}-preview.${input.sequence}.${input.shortSha}`,
  );
};

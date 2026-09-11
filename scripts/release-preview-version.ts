import { validateReleaseVersion } from "./release-shared.js";

export const derivePreviewVersion = (input: {
  readonly base: string;
  readonly dirty: boolean;
  readonly seconds: number;
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
  const tail = input.dirty ? `${input.shortSha}.dirty` : input.shortSha;

  return validateReleaseVersion(`${major}.${minor}.${patch}-preview.${input.seconds}.${tail}`);
};

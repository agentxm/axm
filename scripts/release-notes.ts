import { git } from "./release-shared.js";

const CHANGELOG_PATH = "CHANGELOG.md";

const releaseHeading = (version: string) => `## ${version} (`;

export const extractReleaseNotesForVersion = (changelog: string, version: string): string => {
  const lines = changelog.split("\n");
  const startIndex = lines.findIndex((line) => line.startsWith(releaseHeading(version)));

  if (startIndex === -1) {
    throw new Error(`Could not find CHANGELOG entry for version ${version}.`);
  }

  const nextHeadingIndex = lines.findIndex(
    (line, index) => index > startIndex && line.startsWith("## "),
  );
  const endIndex = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
  const releaseNotes = lines.slice(startIndex, endIndex).join("\n").trim();

  if (releaseNotes.length === 0) {
    throw new Error(`CHANGELOG entry for version ${version} is empty.`);
  }

  return releaseNotes;
};

export const releaseNotesAtRef = (ref: string, version: string): string =>
  extractReleaseNotesForVersion(git("show", `${ref}:${CHANGELOG_PATH}`), version);
